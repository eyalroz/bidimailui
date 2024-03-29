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
    for (let [windowHref, relativeInjectorPath] of registrationInfo) {
      let absoluteWindowHref = (windowHref.startsWith('about:') || windowHref.startsWith("chrome://")) ?
        windowHref : `chrome://messenger/content/${windowHref}`;
      let jsFile = `chrome://bidimailui/content/overlay-injectors/${relativeInjectorPath}`;
      messenger.WindowListener.registerWindow(absoluteWindowHref, jsFile);
    }
  };

  registerChromeInjectors([
    ["about:3pane",                                 "3pane.js"            ],
    ["messenger.xhtml",                             "messenger.js"        ],
    ["about:message",                               "3pane.js"            ],
    ["messageWindow.xhtml",                         "messenger.js"        ],
    ["messengercompose/messengercompose.xhtml",     "messengercompose.js" ],
    ["customizeToolbar.xhtml",                      "customizeToolbar.js" ]
  ]);

  messenger.WindowListener.registerOptionsPage("chrome://bidimailui/content/bidimailui-prefs-dialog.xhtml");
  messenger.WindowListener.startListening();
})();
