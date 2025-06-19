chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'convertText') {
    convertToTaiwanese(request.text)
      .then(converted => {
        sendResponse({ converted: converted });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }
});

async function convertToTaiwanese(text) {
  try {
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
    return convertedText;
  } catch (error) {
    throw error;
  }
}