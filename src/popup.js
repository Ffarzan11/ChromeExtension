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
      },
      args: [translatedNodes],
    });

    console.log("Page translation complete!");
  } catch (err) {
    console.error("Translation failed:", err);
  }
}
