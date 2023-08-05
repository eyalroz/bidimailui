// Loader / background script
// for the BiDi Mail UI Thunderbird extension
// by Eyal Rozenberg

(async function () {
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
  let registerChromeInjectors = function (registrationInfo) {
    for (let [relativeWindowHref, relativeInjectorPath] of registrationInfo) {
      messenger.WindowListener.registerWindow(
        `chrome://messenger/content/${relativeWindowHref}`,
        `chrome://bidimailui/content/overlay-injectors/${relativeInjectorPath}`
      );
    }
  };

  registerChromeInjectors([
    ["messenger.xhtml",                         "messenger.js"        ],
    ["messageWindow.xhtml",                     "messenger.js"        ],
    ["messengercompose/messengercompose.xhtml", "messengercompose.js" ],
    ["customizeToolbar.xhtml",                  "customizeToolbar.js" ]
  ]);

  messenger.WindowListener.registerOptionsPage("chrome://bidimailui/content/bidimailui-prefs-dialog.xhtml");
  messenger.WindowListener.startListening();
})();
