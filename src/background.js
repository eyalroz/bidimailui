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

  messenger.WindowListener.registerWindow("chrome://messenger/content/messenger.xhtml", "chrome://bidimailui/content/overlay-injectors/messenger.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messageWindow.xhtml",                     "chrome://bidimailui/content/overlay-injectors/messenger.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messengercompose/messengercompose.xhtml", "chrome://bidimailui/content/overlay-injectors/messengercompose.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/editorOverlay.xhtml",                     "chrome://bidimailui/content/overlay-injectors/editorOverlay.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/cutomizeToolbar.xhtml",                   "chrome://bidimailui/content/overlay-injectors/customizeToolbar.js");

  messenger.WindowListener.registerOptionsPage("chrome://bidimailui/content/bidimailui-prefs-dialog.xhtml")
  messenger.WindowListener.startListening();
})()
