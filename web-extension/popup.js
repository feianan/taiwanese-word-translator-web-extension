document.addEventListener('DOMContentLoaded', function() {
  const toggleSwitch = document.getElementById('toggleSwitch');
  
  // 載入儲存的狀態
  chrome.storage.local.get(['isEnabled'], function(result) {
    toggleSwitch.checked = result.isEnabled || false;
  });
  
  // 監聽開關狀態變化
  toggleSwitch.addEventListener('change', function() {
    const isEnabled = toggleSwitch.checked;
    chrome.storage.local.set({ isEnabled: isEnabled });
    
    // 通知 content script 狀態改變
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleEnabled', isEnabled: isEnabled })
          .catch(error => {
            console.error('無法與 content script 建立連接:', error);
          });
      }
    });
  });
}); 