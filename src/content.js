"use strict";

let enabled = false;
console.log("Content script loaded");

// Listen for storage changes (slider ON/OFF)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.enabled) {
    enabled = changes.enabled.newValue;
    if (enabled) {
      translatePage();
    } else {
      console.log("Translation disabled");
    }
  }
});

// Function to detect language from <html lang="">
function detectLanguage() {
  const htmlLang = document.documentElement.lang;
  if (htmlLang && htmlLang !== "") {
    return htmlLang;
  }
  return "auto"; // fallback to auto-detect
}

// Function to walk text nodes
function getTextNodes() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (node.nodeValue.trim()) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      },
    },
    false
  );

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }
  return nodes;
}

// Translate the page
async function translatePage() {
  if (!enabled) return;
  if (!("Translator" in self)) {
    console.error("Translator API not supported in this context");
    return;
  }

  const sourceLang = detectLanguage();
  const targetLang = "en"; // always translate to English

  try {
    console.log(`Translating page from ${sourceLang} to ${targetLang}...`);
    const translator = await Translator.create({
      sourceLanguage: sourceLang,
      targetLanguage: targetLang,
    });

    const textNodes = getTextNodes();

    for (const node of textNodes) {
      const originalText = node.nodeValue;
      const translatedText = await translator.translate(originalText);
      node.nodeValue = translatedText;
    }

    console.log("Page translation complete!");
  } catch (err) {
    console.error("Page translation failed:", err);
  }
}
