// Loader / background script
// for the BiDi Mail UI Thunderbird extension
// by Eyal Rozenberg

(async function() {
  messenger.WindowListener.registerDefaultPrefs("defaults/preferences/bidimailui.js");
  messenger.WindowListener.registerChromeUrl([
    ["content",  "bidimailui",           "chrome/content/"      ],
    ["resource", "bidimailui",           "chrome/"              ],
    ["locale",   "bidimailui", "en-US",  "chrome/locale/en-US/" ],
    ["locale",   "bidimailui", "he",     "chrome/locale/he/"    ],
    ["locale",   "bidimailui", "ar",     "chrome/locale/ar/"    ],
    ["locale",   "bidimailui", "fa",     "chrome/locale/fa/"    ],
    ["locale",   "bidimailui", "ur",     "chrome/locale/ur/"    ]
  ]);

  let browserInfo = await browser.runtime.getBrowserInfo();
  let majorVersion = parseInt(browserInfo.version.split('.',1)[0]);
  let xulSuffix = (majorVersion >= 69 ? "xhtml" : "xul");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messenger." + xulSuffix,                         "chrome://bidimailui/content/overlay-injectors/messenger.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messageWindow." + xulSuffix,                     "chrome://bidimailui/content/overlay-injectors/messenger.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messengercompose/messengercompose." + xulSuffix, "chrome://bidimailui/content/overlay-injectors/messengercompose.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/editorOverlay." + xulSuffix,                     "chrome://bidimailui/content/overlay-injectors/editorOverlay.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/cutomizeToolbar." + xulSuffix,                   "chrome://bidimailui/content/overlay-injectors/customizeToolbar.js");

  messenger.WindowListener.registerOptionsPage("chrome://bidimailui/content/bidimailui-prefs." + xulSuffix)
  messenger.WindowListener.startListening();
})()
