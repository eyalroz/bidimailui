var { BiDiMailUI } = ChromeUtils.importESModule("chrome://bidimailui/content/bidimailui-common.mjs");

// This file constains UI and glue code only, calling
// display logic code elsewhere actually act on the displayed message

BiDiMailUI.MessageOverlay = {};

// We set this flag before reloading a message due to
// character set mis-detection, to prevent repeated reloading
BiDiMailUI.MessageOverlay.dontReload = false;


// Get the innermost window containing the actual displayed message; it is not necessarily/not usually
// the outer window with the menu and toolbars etc. Also, the first option will work for 3-pane (outer)
// TB windows, and the second will work for single-message (outer) TB windows
BiDiMailUI.MessageOverlay.getInnerMostMessageWindow = function (win) {
  return win?.document.getElementById("tabmail")?.currentAboutMessage
    ||   win?.document.getElementById("messageBrowser")?.contentWindow;
};

BiDiMailUI.MessageOverlay.getActualMessageDocument = function (win) {
  if (typeof win == 'undefined') {
    win = window;
  }
  let windowWithMessagePane = BiDiMailUI.MessageOverlay.getInnerMostMessageWindow(win) ?? win;
  let messagePaneBrowser = windowWithMessagePane?.getMessagePaneBrowser?.();
  return messagePaneBrowser?.contentWindow.document;
};

BiDiMailUI.MessageOverlay.cycleDirectionSettings = function (win) {
  let document = BiDiMailUI.MessageOverlay.getActualMessageDocument(window);
  let cycler = (attr) => {
    switch (attr) {
    case 'ltr': return 'rtl';
    case 'rtl': return null;
    default: return 'ltr';
    }
  };
  let newDir = cycler(document.documentElement.getAttribute('bidimailui-forced-direction'));
  BiDiMailUI.Display.setMessageDirectionForcing(document, newDir);
  BiDiMailUI.MessageOverlay.updateDirectionMenuButton(newDir);
};

BiDiMailUI.MessageOverlay.forceDirection = function (ev, forcedDirection) {
  let messageDocument = BiDiMailUI.MessageOverlay.getActualMessageDocument(window);
  BiDiMailUI.Display.setMessageDirectionForcing(messageDocument, forcedDirection);
  BiDiMailUI.MessageOverlay.updateDirectionMenuButton(forcedDirection);
  ev.stopPropagation();
};

BiDiMailUI.MessageOverlay.updateDirectionMenuButton = function (forcedDirection) {
  const menubutton = document.getElementById('bidimailui-forcing-menubutton');
  if (menubutton) {
    menubutton.setAttribute('selectedItem', (forcedDirection ?? 'autodetect'));
    document.getElementById('bidimailui-forcing-menu-autodetect')
            .setAttribute('checked', String(!forcedDirection));
    document.getElementById('bidimailui-forcing-menu-ltr')
            .setAttribute('checked', String(forcedDirection == 'ltr'));
    document.getElementById('bidimailui-forcing-menu-rtl')
            .setAttribute('checked', String(forcedDirection == 'rtl'));
  }
};

BiDiMailUI.MessageOverlay.setForcedCharacterSet = function (aCharset) {
  // This is no longer supported (!) in Thunderbird - you cannot change the charset
  // messenger.setDocumentCharset(aCharset);
  msgWindow.mailCharacterSet = aCharset;
  msgWindow.charsetOverride = true;
  messenger.forceDetectDocumentCharset();
};

BiDiMailUI.MessageOverlay.isFillerStaticPage = function (domDocument) {
  return /^http:\/\/.*www\.mozilla.*\/start\/$/.test(domDocument.baseURI);
};


BiDiMailUI.MessageOverlay.gatherParameters = function (win) {
  // Note: Unfortunately, the window here may be undefined :-(
  // we have some fallback for that in the definition of the two functions below, but it's
  // rather ugly.
  let aboutMessage = BiDiMailUI.MessageOverlay.getInnerMostMessageWindow(win);
  let domDocument = BiDiMailUI.MessageOverlay.getActualMessageDocument(win);

  if (!domDocument) {
    // This should only happen when no message is loaded in the window, e.g. when you just
    // opened Thunderbird and see the app's welcome message. Let's assume that's the case
    // and not fill up the console
    return [null, null, null];
  }

  let canActOnDocument = (domDocument?.baseURI && domDocument?.body)
    && (domDocument.baseURI != "about:blank")
    && !BiDiMailUI.MessageOverlay.isFillerStaticPage(domDocument);
  if (!canActOnDocument) {
    console.warn(`BiDiMailUI can't act on DOM document ${domDocument.URL}`);
    return [null, null, null];
  }

  // Note: This is very brittle, and is likely to break with minor changes to
  // the TB UI; it would have been better to hook into TB's own determination
  // of the message subject, recode at that point, and let it flow from there
  // to the UI.
  let subjectSpan = aboutMessage.document.getElementById('expandedsubjectBox').children.item(1);

  const charsetPhaseParams = {
    body: domDocument.body,
    charsetOverrideInEffect: true,
    currentCharset: aboutMessage.currentCharacterSet,
    messageHeader: aboutMessage.gMessage,
    messageSubject: subjectSpan ? subjectSpan.textContent : aboutMessage.gMessage.mime2DecodedSubject,
    subjectSetter: (str) => { if (subjectSpan) { subjectSpan.textContent = str; } },
    unusableCharsetHandler : BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset,
  };
  return [domDocument, domDocument.body, charsetPhaseParams];
};


BiDiMailUI.MessageOverlay.onLoad = function (win) {
  let [domDocument, body, charsetPhaseParams] = BiDiMailUI.MessageOverlay.gatherParameters(win);
  if (!domDocument || !body || !charsetPhaseParams) {
    // If there wasd a serious error, an exception would have been thrown already;
    // so we're just silently failing
    BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null, true);
    return;
  }

  BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection(charsetPhaseParams);
  if (charsetPhaseParams.needCharsetForcing) {
    BiDiMailUI.MessageOverlay.setForcedCharacterSet(charsetPhaseParams.charsetToForce);
    BiDiMailUI.MessageOverlay.dontReload = true;
    // we're reloading with a different charset, don't do anything else
    return;
  }
  BiDiMailUI.MessageOverlay.dontReload = false;
    // clearing BiDiMailUI.MessageOverlay.dontReload for other messages

  BiDiMailUI.Display.ActionPhases.htmlNumericEntitiesDecoding(body);
  BiDiMailUI.Display.ActionPhases.quoteBarsCSSFix(domDocument);
  BiDiMailUI.Display.ActionPhases.directionAutodetection(domDocument);

  BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null);
};

// Functions from here on should not be used by code outside this file

// this function is passed to the charset phase actions and run
// from there, but it's a UI function
BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset = function () {
  const list = [
    BiDiMailUI.Strings.getByName("charset_dialog.set_to_windows_1255"),
    BiDiMailUI.Strings.getByName("charset_dialog.set_to_windows_1256"),
    BiDiMailUI.Strings.getByName("charset_dialog.do_not_set")
  ];
  // This disappears in version 91, probably
  const appPrefValue = BiDiMailUI.AppPrefs.get("mailnews.view_default_charset", null, Ci.nsIPrefLocalizedString);
  let selected = (appPrefValue) ? { value: appPrefValue } : {};
  const ok = Services.prompt.select(
    window,
    BiDiMailUI.Strings.getByName("charset_dialog.window_title"),
    BiDiMailUI.Strings.getByName("charset_dialog.dialog_message"),
    list, selected);

  if (!ok) { return; }
  switch (selected.value) {
  case 0:
    BiDiMailUI.Prefs.set("display.preferred_single_byte_charset", "windows-1255"); break;
  case 1:
    BiDiMailUI.Prefs.set("display.preferred_single_byte_charset", "windows-1256"); break;
  case 2:
  default:
    BiDiMailUI.Prefs.set("display.user_forgoes_preferred_single_byte_charset", true);
    BiDiMailUI.Prefs.reset("display.preferred_single_byte_charset");
    break;
  }
};
