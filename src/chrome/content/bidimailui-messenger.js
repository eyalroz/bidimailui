var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

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

  onLoad : function() {
#ifdef DEBUG_onLoad

    console.log("--- onLoad() ---");
    try {
      console.log(
        "message URI: " + gFolderDisplay.selectedMessageUris[0] +
        "\nnumber of selected messages: " + gFolderDisplay.selectedMessageUris.length);
    } catch(ex) {
      console.log("can't get message URI");
    }
#endif

    // First, let's make sure we can poke the:
    // - message window
    // - message body
    // - URI of the loaded message

    if (!msgWindow) {
#ifdef DEBUG_onLoad
      console.log("couldn't get msgWindow");
#endif
      BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null,true);
      return;
    }
    var domDocument;
    try {
      domDocument = this.docShell.contentViewer.DOMDocument;
    }
    catch (ex) {
#ifdef DEBUG_onLoad
      console.log("couldn't get DOMDocument");
#endif
      dump(ex);
      return;
    }

    if ((!domDocument.baseURI) ||
        (domDocument.baseURI == "about:blank") ||
        (/^http:\/\/.*www\.mozilla.*\/start\/$/.test(domDocument.baseURI))) {
      BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null,true);
      return;
    }
      
    var body = domDocument.body;
    if (!body) {
#ifdef DEBUG_onLoad
      console.log("couldn't get DOMDocument body");
#endif
      BiDiMailUI.MessageOverlay.updateDirectionMenuButton(null,true);
      return;
    }
    
    // We're assuming only one message is selected

    var msgHdr;
    try {
      msgHdr = gMessageDisplay.displayedMessage;
    } catch(ex) {
      try {
        msgHdr = messenger.msgHdrFromURI(gFolderDisplay.selectedMessageUris[0]);
      } catch(ex) {
        msgHdr = messenger.msgHdrFromURI(GetLoadedMessage());
      }
    }

    let displayedMessageSubject;
    try {
        displayedMessageSubject = document.getElementById('expandedsubjectBox').textContent;
#ifdef DEBUG_onLoad
        console.log('Message subject: "' + displayedMessageSubject + '"');
#endif
    }
    catch(ex) {
#ifdef DEBUG_onLoad
      console.log("couldn't get subject:\n" + ex);
#endif
    }

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
      unusableCharsetHandler : BiDiMailUI.MessageOverlay.promptForDefaultCharsetChange,
      needCharsetForcing: false, // this is an out parameter
      charsetToForce: null       // this is an out parameter
    };
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
  promptForDefaultCharsetChange : function() {
    var list = [
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1255"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1256"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.leave_as_is")];
    var selected = {};

#ifdef DEBUG_promptForDefaultCharsetChange
    console.log("BiDiMailUI.Strings.GetStringFromName(\"bidimailui.charset_dialog.set_to_windows_1255\") =\n" + BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1255"));
#endif

    var ok = Services.prompt.select(
      window,
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.window_title"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.dialog_message"),
      list, selected);

    if (ok) {

#ifdef DEBUG_promptForDefaultCharsetChange
    console.log("ok!");
#endif

      var str = 
        Components.classes["@mozilla.org/supports-string;1"]
                  .createInstance(Components.interfaces.nsISupportsString);
      switch (selected.value) {
        case 0:
          str.data = "windows-1255";
          BiDiMailUI.Prefs.setAppStringPref("mailnews.view_default_charset", str);
          return str.data;
        case 1:
          str.data = "windows-1256";
          BiDiMailUI.Prefs.setAppStringPref("mailnews.view_default_charset", str);
          return str.data;
        case 2:
          BiDiMailUI.Prefs.setBoolPref("display.user_accepts_unusable_charset_pref", true);
          break;
      }
    }
#ifdef DEBUG_promptForDefaultCharsetChange
    else console.log("user cancelled the dialog box!");
#endif
    return null;
  }
  
}
