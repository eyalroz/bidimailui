var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");
var Services = globalThis.Services || ChromeUtils.import(
  "resource://gre/modules/Services.jsm"
).Services;

// This file constains UI and glue code only, calling
// display logic code elsewhere actually act on the displayed message

BiDiMailUI.MessageOverlay = {
  // We set this flag before reloading a message due to 
  // character set mis-detection, to prevent repeated reloading
  dontReload : false,

  cycleDirectionSettings : function() {
    var messagePane = document.getElementById("messagepane");
    var body = messagePane.contentDocument.body;
    var newForcedDirection;
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
    BiDiMailUI.Display.setMessageDirectionForcing(body,newForcedDirection);
    BiDiMailUI.MessageOverlay.updateDirectionMenuButton(newForcedDirection);
  },

  forceDirection : function(ev,forcedDirection) {
    var messagePane = document.getElementById("messagepane");
    var body = messagePane.contentDocument.body;
    BiDiMailUI.Display.setMessageDirectionForcing(body,forcedDirection);
    BiDiMailUI.MessageOverlay.updateDirectionMenuButton(forcedDirection);
    ev.stopPropagation();
  },

  updateDirectionMenuButton : function(forcedDirection) {
#ifdef DEBUG_updateDirectionMenuButton
    console.log(
      'updateDirectionMenuButton(forcedDirection = ' + forcedDirection + ')');
#endif
    var menubutton = document.getElementById('bidimailui-forcing-menubutton');
    if (menubutton) {
      menubutton.setAttribute('selectedItem', (forcedDirection ? forcedDirection : 'autodetect'));
      document.getElementById('bidimailui-forcing-menu-autodetect')
              .setAttribute('checked', (!forcedDirection));
      document.getElementById('bidimailui-forcing-menu-ltr')
              .setAttribute('checked', (forcedDirection == 'ltr'));
      document.getElementById('bidimailui-forcing-menu-rtl')
              .setAttribute('checked', (forcedDirection == 'rtl'));
    }
  },

  // the following function is a copy of MessengerSetForcedCharacterSet() from
  // shareglue.js ; somehow, in TB 68, we've lost access to the code in shareglue.js
  setForcedCharacterSet : function(aCharset) {
    messenger.setDocumentCharset(aCharset);
    msgWindow.mailCharacterSet = aCharset;
    msgWindow.charsetOverride = true;
  },

  isFillerStaticPage : function(domDocument) {
    return /^http:\/\/.*www\.mozilla.*\/start\/$/.test(domDocument.baseURI);
  },

  gatherParameters : function() {
    if (!msgWindow) { return [null, null, null]; }
    let domDocument =  msgWindow.messageWindowDocShell.contentViewer.DOMDocument;
      // The following used to work, but now doesn't:
      // this.docShell.contentViewer.DOMDocument;
    let canActOnDocument =
      (domDocument && domDocument.baseURI && domDocument.body
       && (domDocument.baseURI != "about:blank")
       && !BiDiMailUI.MessageOverlay.isFillerStaticPage(domDocument) );
    if (!canActOnDocument) { return [null, null, null]; }
    
    var msgHdr; // We're assuming only one message is selected
    try {
      msgHdr = gMessageDisplay.displayedMessage;
    } catch(ex) {
      try {
        msgHdr = messenger.msgHdrFromURI(gFolderDisplay.selectedMessageUris[0]);
      } catch(ex) {
        msgHdr = messenger.msgHdrFromURI(GetLoadedMessage());
      }
    }
    let displayedMessageSubject = document.getElementById('expandedsubjectBox').textContent;

    var charsetPhaseParams = {
      body: domDocument.body,
      charsetOverrideInEffect: msgWindow.charsetOverride,
      currentCharset: msgWindow.mailCharacterSet,
      messageHeader: msgHdr,
      messageSubject: displayedMessageSubject,
      subjectSetter: 
        function(str) {
          // using the appropriate setter rather than directly
          // setting the valueNode's data
#ifdef DEBUG_onLoad
          console.log('Changing message subject from: "' + document.getElementById('expandedsubjectBox').textContent + '"\nto: "' + str + '"');
#endif
          document.getElementById('expandedsubjectBox').textContent = str;
        },
      unusableCharsetHandler : BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset,
      needCharsetForcing: false, // this is an out parameter
      charsetToForce: null       // this is an out parameter
    };

    return [domDocument, domDocument.body, charsetPhaseParams];
  },

  onLoad : function() {
#ifdef DEBUG_onLoad
    console.log("--- onLoad() ---");
#endif

    let [domDocument, body, charsetPhaseParams] = BiDiMailUI.MessageOverlay.gatherParameters();
    if (!domDocument || !body || !charsetPhaseParams) {
      // If there wasd a serious error, an exception would have been thrown already;
      // so we're just silently failing
      BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null,true);
      return;
    }

    BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection(charsetPhaseParams);
    if (charsetPhaseParams.needCharsetForcing) {
#ifdef DEBUG_fixLoadedMessageCharsetIssues
        console.log("Forcing charset " + charsetPhaseParams.preferredCharset);
#endif
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
  promptAndSetPreferredSingleByteCharset : function() {
    var list = [
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1255"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1256"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.do_not_set")
    ];
    // This disappears in version 91, probably
    var appPrefValue = BiDiMailUI.AppPrefs.get("mailnews.view_default_charset", null, Ci.nsIPrefLocalizedString);
    selected = (appPrefValue) ? { value: appPrefValue } : {};
#ifdef DEBUG_promptAndSetPreferredSingleByteCharset
    console.log("appPrefValue was " + appPrefValue);
#endif

    var ok = Services.prompt.select(
      window,
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.window_title"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.dialog_message"),
      list, selected);

    if (!ok) { return; }
    switch (selected.value) {
      case 0:
#ifdef DEBUG_promptAndSetPreferredSingleByteCharset
        console.log("set charset pref to windows-1255");
#endif
        BiDiMailUI.Prefs.set("display.preferred_single_byte_charset", "windows-1255"); break;
      case 1:
#ifdef DEBUG_promptAndSetPreferredSingleByteCharset
        console.log("set charset pref to windows-1256");
#endif
        BiDiMailUI.Prefs.set("display.preferred_single_byte_charset", "windows-1256"); break;
      case 2:
#ifdef DEBUG_promptAndSetPreferredSingleByteCharset
        console.log("user chose no default charset");
#endif
        BiDiMailUI.Prefs.set("display.user_forgoes_preferred_single_byte_charset", true);
        BiDiMailUI.Prefs.reset("display.preferred_single_byte_charset"); break;
    }
  }
}
