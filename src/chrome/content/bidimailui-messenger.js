var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

// This file constains UI and glue code only, calling
// display logic code elsewhere actually act on the displayed message

BiDiMailUI.MessageOverlay = {
  // We set this flag before reloading a message due to
  // character set mis-detection, to prevent repeated reloading
  dontReload : false,

  cycleDirectionSettings : function () {
    const messagePane = document.getElementById("messagepane");
    const body = messagePane.contentDocument.body;
    let newForcedDirection;
    switch (body.getAttribute('bidimailui-forced-direction')) {
    case 'ltr':
      newForcedDirection = 'rtl';
      break;
    case 'rtl':
      newForcedDirection = null;
      break;
    default: // should be null
      newForcedDirection = 'ltr';
    }
    BiDiMailUI.Display.setMessageDirectionForcing(body, newForcedDirection);
    BiDiMailUI.MessageOverlay.updateDirectionMenuButton(newForcedDirection);
  },

  forceDirection : function (ev, forcedDirection) {
    const messagePane = document.getElementById("messagepane");
    const body = messagePane.contentDocument.body;
    BiDiMailUI.Display.setMessageDirectionForcing(body, forcedDirection);
    BiDiMailUI.MessageOverlay.updateDirectionMenuButton(forcedDirection);
    ev.stopPropagation();
  },

  updateDirectionMenuButton : function (forcedDirection) {
    const menubutton = document.getElementById('bidimailui-forcing-menubutton');
    if (menubutton) {
      menubutton.setAttribute('selectedItem', (forcedDirection ? forcedDirection : 'autodetect'));
      document.getElementById('bidimailui-forcing-menu-autodetect')
              .setAttribute('checked', String(!forcedDirection));
      document.getElementById('bidimailui-forcing-menu-ltr')
              .setAttribute('checked', String(forcedDirection == 'ltr'));
      document.getElementById('bidimailui-forcing-menu-rtl')
              .setAttribute('checked', String(forcedDirection == 'rtl'));
    }
  },

  setForcedCharacterSet : function (aCharset) {
    // This is no longer supported (!) in Thunderbird - you cannot change the charset
    // messenger.setDocumentCharset(aCharset);
    msgWindow.mailCharacterSet = aCharset;
    msgWindow.charsetOverride = true;
    // ... but maybe force-detecting might help some
    messenger.forceDetectDocumentCharset();
  },

  isFillerStaticPage : function (domDocument) {
    return /^http:\/\/.*www\.mozilla.*\/start\/$/.test(domDocument.baseURI);
  },

  gatherParameters : function () {
    if (!msgWindow) { return [null, null, null]; }
    let domDocument =  msgWindow.messageWindowDocShell.contentViewer.DOMDocument;
      // The following used to work, but now doesn't:
      // this.docShell.contentViewer.DOMDocument;
    let canActOnDocument =
      (domDocument && domDocument.baseURI && domDocument.body &&
       (domDocument.baseURI != "about:blank") &&
       !BiDiMailUI.MessageOverlay.isFillerStaticPage(domDocument));
    if (!canActOnDocument) { return [null, null, null]; }

    let msgHdr; // We're assuming only one message is selected
    try {
      msgHdr = gMessageDisplay.displayedMessage;
    } catch (ex) {
      try {
        msgHdr = messenger.msgHdrFromURI(gFolderDisplay.selectedMessageUris[0]);
      } catch (ex) {
        msgHdr = messenger.msgHdrFromURI(GetLoadedMessage());
      }
    }
    let displayedMessageSubject = document.getElementById('expandedsubjectBox').textContent;

    const charsetPhaseParams = {
      body: domDocument.body,
      charsetOverrideInEffect: msgWindow.charsetOverride,
      currentCharset: msgWindow.mailCharacterSet,
      messageHeader: msgHdr,
      messageSubject: displayedMessageSubject,
      subjectSetter:
        function (str) {
          // using the appropriate setter rather than directly
          // setting the valueNode's data
          document.getElementById('expandedsubjectBox').textContent = str;
        },
      unusableCharsetHandler : BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset,
      needCharsetForcing: false, // this is an out parameter
      charsetToForce: null       // this is an out parameter
    };

    return [domDocument, domDocument.body, charsetPhaseParams];
  },

  onLoad : function () {
    let [domDocument, body, charsetPhaseParams] = BiDiMailUI.MessageOverlay.gatherParameters();
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
  },

// Functions from here on should not be used by code outside this file

  // this function is passed to the charset phase actions and run
  // from there, but it's a UI function
  promptAndSetPreferredSingleByteCharset : function () {
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
  }
};
