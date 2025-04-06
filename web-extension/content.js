let isEnabled = false;
let observer = null;

// 初始化時檢查狀態
chrome.storage.local.get(['isEnabled'], function(result) {
  isEnabled = result.isEnabled || false;
  if (isEnabled) {
    startObserving();
  }
});

// 監聽來自 popup 的訊息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'toggleEnabled') {
    isEnabled = request.isEnabled;
    if (isEnabled) {
      startObserving();
    } else {
      stopObserving();
      removeHighlights();
    }
  }
});

// 開始監聽 DOM 變化
function startObserving() {
  if (observer) {
    observer.disconnect();
  }
  
  // 處理當前頁面的內容
  processPage();
  
  // 設置 MutationObserver
  observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length) {
        processPage();
      }
    });
  });
  
  // 開始觀察整個文檔的變化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 停止監聽 DOM 變化
function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// 處理頁面內容
function processPage() {
  // 移除現有的標記
  removeHighlights();
  
  // 取得所有文字節點
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // 檢查節點是否包含中文字
        if (containsChinese(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    },
    false
  );

  let node;
  let textNodes = [];
  let allText = '';
  
  // 收集所有文字節點和文字
  while (node = walker.nextNode()) {
    // 檢查節點是否包含中文字
    if (containsChinese(node.nodeValue)) {
      // 檢查節點是否為純中文字
      if (isPureChinese(node.nodeValue)) {
        textNodes.push(node);
        allText += node.nodeValue + '\u0001'; // 使用 \u0001 作為分隔符
      }
    }
  }
  
  // 發送到 background script 進行轉換
  chrome.runtime.sendMessage({
    action: 'convertText',
    text: allText
  }, function(response) {
    if (response && response.converted) {
      highlightDifferences(allText, response.converted, textNodes);
    }
  });
}

// 檢查字串是否包含中文字
function containsChinese(str) {
  return /[\u4e00-\u9fa5]/.test(str);
}

// 檢查字串是否為純中文字
function isPureChinese(str) {
  // 移除空白字符
  str = str.trim();
  
  // 如果字串為空，則不為純中文字
  if (str.length === 0) {
    return false;
  }
  
  // 檢查字串是否包含 React/Next.js 的內部代碼
  if (
    str.includes('__next_f') || 
    str.includes('$undefined') || 
    str.includes('children') || 
    str.includes('className') || 
    str.includes('target') || 
    str.includes('href') || 
    str.includes('rel') || 
    str.includes('stroke') || 
    str.includes('fill') || 
    str.includes('viewBox') || 
    str.includes('xmlns') ||
    str.includes('d=') ||
    str.includes('width=') ||
    str.includes('height=') ||
    str.includes('style=') ||
    str.includes('fillRule=') ||
    str.includes('openQrModal')
  ) {
    return false;
  }
  
  // 檢查字串是否包含中文字
  return /[\u4e00-\u9fa5]/.test(str);
}

// 標記差異
function highlightDifferences(original, converted, nodes) {
  const originalLines = original.split('\u0001');
  const convertedLines = converted.split('\u0001');
  
  let nodeIndex = 0;
  
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i] !== convertedLines[i]) {
      // 找出具體的差異詞
      const diffWords = findDiffWords(originalLines[i], convertedLines[i]);
      
      // 找到對應的節點
      const node = nodes[nodeIndex];
      if (node) {
        // 創建一個 span 元素來包裹原始文字
        const span = document.createElement('span');
        
        // 只標記差異詞
        let nodeText = node.nodeValue;
        for (const diffWord of diffWords) {
          const [originalWord, convertedWord] = diffWord.split(' → ');
          // 使用正則表達式來確保只替換完整的詞，並轉義特殊字符
          const escapedWord = originalWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedWord, 'g');
          nodeText = nodeText.replace(regex, `<span class="tw-highlight" title="${convertedWord}">${originalWord}</span>`);
        }
        
        span.innerHTML = nodeText;
        node.parentNode.replaceChild(span, node);
      }
    }
    nodeIndex++;
  }
}

// 找出兩個字串中的差異詞
function findDiffWords(original, converted) {
  // 將字串分割成詞，使用更精確的分割方式
  const originalWords = original.split(/([，。！？、：；「」『』（）\s])/g).filter(word => word.trim());
  const convertedWords = converted.split(/([，。！？、：；「」『』（）\s])/g).filter(word => word.trim());
  
  const diffWords = [];
  
  // 比較每個詞
  for (let i = 0; i < Math.min(originalWords.length, convertedWords.length); i++) {
    if (originalWords[i] !== convertedWords[i] && originalWords[i].length > 0) {
      diffWords.push(`${originalWords[i]} → ${convertedWords[i]}`);
    }
  }
  
  return diffWords;
}

// 移除所有標記
function removeHighlights() {
  const highlights = document.getElementsByClassName('tw-highlight');
  while (highlights.length > 0) {
    const highlight = highlights[0];
    const text = document.createTextNode(highlight.textContent);
    highlight.parentNode.replaceChild(text, highlight);
  }
} 