// The toolbar icon has no popup, so clicking it fires onClicked. We open the
// full reader page in a tab — a reading app wants room, not a cramped popup.
chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL('index.html')
  // Reuse an existing Reader tab if one is already open, otherwise create one.
  chrome.tabs.query({ url }, (tabs) => {
    if (tabs && tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true })
      if (tabs[0].windowId != null) {
        chrome.windows.update(tabs[0].windowId, { focused: true })
      }
    } else {
      chrome.tabs.create({ url })
    }
  })
})
