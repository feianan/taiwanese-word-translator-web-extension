const IGNORE_STRINGS = [
  '__next_f',
  '$undefined',
  'children',
  'className',
  'target',
  'href',
  'rel',
  'stroke',
  'fill',
  'viewBox',
  'xmlns',
  'd=',
  'width=',
  'height=',
  'style=',
  'fillRule=',
  'openQrModal'
];
const CHINESE_REGEX = /[\u4e00-\u9fa5]/;
const WORD_SPLIT_REGEX = /([，。！？、：；「」『』（）\s])/g;
const HIGHLIGHT_CLASS = 'tw-highlight';
const TEXT_SEPARATOR = '\u0001';
const ACTION_TOGGLE_ENABLED = 'toggleEnabled';
const ACTION_CONVERT_TEXT = 'convertText';

let isEnabled = false;
let observer = null;
let isProcessing = false;
let processTimeout = null;
let lastAllText = null;
let extensionInvalid = false;

// ===== 初始化：讀取狀態並啟動功能 =====
chrome.storage.local.get(['isEnabled'], function(result) {
  isEnabled = result.isEnabled || false;
  if (isEnabled) {
    startObserving();
    processPage();
  }
});

// ===== popup 監聽階段 =====
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === ACTION_TOGGLE_ENABLED) {
    isEnabled = request.isEnabled;
    if (isEnabled) {
      startObserving();
      processPage();
    } else {
      stopObserving();
      removeHighlights();
    }
  }
});

// ===== DOM 監聽與處理階段 =====
function startObserving() {
  if (observer) {
    observer.disconnect();
  }
  isProcessing = false;
  extensionInvalid = false;
  observer = new MutationObserver(function(mutations) {
    if (mutations.some(mutation => mutation.addedNodes.length > 0)) {
      debouncedProcessPage();
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isProcessing = false;
  lastAllText = null;
}

// ===== API 溝通階段 =====
function processPage() {
  if (shouldSkipProcessing()) return;

  prepareForProcessing();

  const { textNodes, allText } = collectChineseTextNodes();
  if (isSameAsLast(allText)) return finishProcessing();

  lastAllText = allText;
  sendConvertRequest(allText, textNodes, finishProcessing, handleExtensionInvalid);
}

function shouldSkipProcessing() {
  return isProcessing || extensionInvalid;
}

function prepareForProcessing() {
  isProcessing = true;
  if (observer) observer.disconnect();
  removeHighlights();
}

function collectChineseTextNodes() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (isChineseText(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    },
    false
  );
  const textNodes = [];
  let allText = '';
  while (true) {
    const node = walker.nextNode();
    if (!node) break;
    if (!isChineseText(node.nodeValue)) continue;
    textNodes.push(node);
    allText += node.nodeValue + TEXT_SEPARATOR;
  }
  return { textNodes, allText };
}

function isSameAsLast(allText) {
  return allText === lastAllText;
}

function finishProcessing() {
  startObserving();
  isProcessing = false;
}

function sendConvertRequest(allText, textNodes, onFinish, onError) {
  try {
    chrome.runtime.sendMessage({
      action: ACTION_CONVERT_TEXT,
      text: allText
    }, function(response) {
      if (chrome.runtime.lastError) {
        onError();
        return;
      }
      if (response && response.converted) {
        highlightDifferences(allText, response.converted, textNodes);
      }
      onFinish();
    });
  } catch (e) {
    onFinish();
  }
}

function handleExtensionInvalid() {
  if (!extensionInvalid) {
    extensionInvalid = true;
    stopObserving();
    console.info('Extension context invalidated, skip processPage. Error:', chrome.runtime.lastError?.message);
  }
  isProcessing = false;
}

// ===== 比對與標記階段 =====
function highlightDifferences(original, converted, nodes) {
  const originalLines = original.split(TEXT_SEPARATOR);
  const convertedLines = converted.split(TEXT_SEPARATOR);

  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i] === convertedLines[i]) continue;
    const node = nodes[i];
    if (!node) continue;

    const diffWords = findDiffWords(originalLines[i], convertedLines[i]);
    const span = createHighlightedSpan(node.nodeValue, diffWords);
    node.parentNode.replaceChild(span, node);
  }
}

function createHighlightedSpan(text, diffWords) {
  let nodeText = text;
  for (const diffWord of diffWords) {
    const [originalWord, convertedWord] = diffWord.split(' → ');
    const escapedWord = originalWord.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(escapedWord, 'g');
    nodeText = nodeText.replace(
      regex,
      `<span class="${HIGHLIGHT_CLASS}" title="${convertedWord}">${originalWord}</span>`
    );
  }
  const span = document.createElement('span');
  span.innerHTML = nodeText;
  return span;
}

// ===== 輔助功能 =====
function findDiffWords(original, converted) {
  const originalWords = original.split(WORD_SPLIT_REGEX).filter(word => word.trim());
  const convertedWords = converted.split(WORD_SPLIT_REGEX).filter(word => word.trim());
  const diffWords = [];
  for (let i = 0; i < Math.min(originalWords.length, convertedWords.length); i++) {
    if (originalWords[i] !== convertedWords[i] && originalWords[i].length > 0) {
      diffWords.push(`${originalWords[i]} → ${convertedWords[i]}`);
    }
  }
  return diffWords;
}

function isChineseText(str) {
  str = str.trim();
  if (str.length === 0) {
    return false;
  }
  if (IGNORE_STRINGS.some(ignore => str.includes(ignore))) {
    return false;
  }
  return CHINESE_REGEX.test(str);
}

function removeHighlights() {
  const highlights = document.getElementsByClassName(HIGHLIGHT_CLASS);
  while (highlights.length > 0) {
    const highlight = highlights[0];
    const text = document.createTextNode(highlight.textContent);
    highlight.parentNode.replaceChild(text, highlight);
  }
}

function debouncedProcessPage() {
  if (processTimeout) clearTimeout(processTimeout);
  processTimeout = setTimeout(processPage, 200);
} 