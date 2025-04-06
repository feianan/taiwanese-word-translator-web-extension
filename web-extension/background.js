// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'convertText') {
    convertToTaiwanese(request.text)
      .then(converted => {
        sendResponse({ converted: converted });
      })
      .catch(error => {
        console.error('轉換失敗:', error);
        sendResponse({ error: error.message });
      });
    return true; // 保持訊息通道開啟
  }
});

// 轉換文字為台灣用語
async function convertToTaiwanese(text) {
  try {
    // 移除多餘的空白行，只保留一個換行符
    const cleanedText = text.replace(/\n+/g, '\n').trim();

    const response = await fetch('https://api.zhconvert.org/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: cleanedText,
        converter: 'Taiwan'
      })
    });

    if (!response.ok) {
      throw new Error('API 請求失敗');
    }

    const data = await response.json();
    const convertedText = data.data.text;
    
    // 比對並輸出差異
    const originalLines = cleanedText.split('\n');
    const convertedLines = convertedText.split('\n');
    
    console.log('差異比對：');
    for (let i = 0; i < originalLines.length; i++) {
      if (originalLines[i] !== convertedLines[i]) {
        // 找出具體的差異詞
        const diffWords = findDiffWords(originalLines[i], convertedLines[i]);
        console.log(`差異詞：\n${diffWords.join('\n')}`);
      }
    }

    return convertedText;
  } catch (error) {
    console.error('API 錯誤:', error);
    throw error;
  }
}

// 找出兩個字串中的差異詞
function findDiffWords(original, converted) {
  // 將字串分割成詞
  const originalWords = original.split(/([，。！？、：；「」『』（）\s])/g).filter(word => word.trim());
  const convertedWords = converted.split(/([，。！？、：；「」『』（）\s])/g).filter(word => word.trim());
  
  const diffWords = [];
  
  // 比較每個詞
  for (let i = 0; i < Math.min(originalWords.length, convertedWords.length); i++) {
    if (originalWords[i] !== convertedWords[i]) {
      diffWords.push(`${originalWords[i]} → ${convertedWords[i]}`);
    }
  }
  
  return diffWords;
} 