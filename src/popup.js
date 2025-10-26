"use strict";

const checkbox = document.getElementById("enabled");

// Initialize slider state
chrome.storage.sync.get("enabled", (data) => {
  checkbox.checked = !!data.enabled;
});

// Update storage when slider changes
checkbox.addEventListener("change", async (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const enabled = event.target.checked;
  chrome.storage.sync.set({ enabled });

  if (enabled) {
    await translateActiveTab();
  }
});

// Function to translate the active tab's page
async function translateActiveTab() {
  if (!("Translator" in self)) {
    console.error("Translator API not supported in this context");
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Detect the language
    const language = await chrome.tabs.detectLanguage(tab.id);
    console.log("Detected language:", language);

    // Don't translate if already in English
    if (language === "en") {
      console.log("Page is already in English");
      return;
    }

    // add loading overlay
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Create loading overlay
        const overlay = document.createElement("div");
        overlay.id = "translator-loading-overlay";
        overlay.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div class="translator-spinner"></div>
            <p style="color: white; margin-top: 15px; font-size: 16px;">Translating... please wait</p>
          </div>
        `;

        // Add styles
        const style = document.createElement("style");
        style.textContent = `
          #translator-loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
          }
          .translator-spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: translator-spin 1s linear infinite;
          }
          @keyframes translator-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
      },
    });

    const translator = await Translator.create({
      sourceLanguage: language,
      targetLanguage: "en",
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Gather all visible text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              node.nodeValue.trim()
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
          }
        );
        const nodes = [];
        let node;
        while ((node = walker.nextNode())) nodes.push(node.nodeValue);
        return nodes;
      },
    });

    console.log("start translating text nodes...");

    const textNodes = results[0].result;
    const translatedNodes = [];
    for (const text of textNodes) {
      const translated = await translator.translate(text);
      translatedNodes.push(translated);
    }

    // Replace page text nodes with translated text
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (translatedNodes) => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) =>
              node.nodeValue.trim()
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT,
          }
        );
        let i = 0,
          node;
        while ((node = walker.nextNode())) {
          node.nodeValue = translatedNodes[i++];
        }
        //remove the overlay
        const overlay = document.getElementById("translator-loading-overlay");
        if (overlay) overlay.remove();
      },
      args: [translatedNodes],
    });
    console.log("Page translation complete!");
  } catch (err) {
    console.error("Translation failed:", err);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // remove the overlay in case of error
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const overlay = document.getElementById("translator-loading-overlay");
        if (overlay) overlay.remove();
      },
    });
  }
}
