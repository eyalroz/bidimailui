var moduleURI = "chrome://bidimailpack/content/bidimailpack-common.js";
if (typeof(ChromeUtils) != "undefined") {
  if (ChromeUtils.import) {
    var { RemoveDupes } = ChromeUtils.import(moduleURI);
  }
  else { Components.utils.import(moduleURI);}
}
else { Components.utils.import(moduleURI); }

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
    BiDiMailUI.JSConsoleService.logStringMessage(
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

    BiDiMailUI.JSConsoleService.logStringMessage("--- onLoad() ---");
    try {
      BiDiMailUI.JSConsoleService.logStringMessage(
        "message URI: " + gFolderDisplay.selectedMessageUris[0] +
        "\nnumber of selected messages: " + gFolderDisplay.selectedMessageUris.length);
    } catch(ex) {
      BiDiMailUI.JSConsoleService.logStringMessage("can't get message URI");
    }
#endif

    // First, let's make sure we can poke the:
    // - message window
    // - message body
    // - URI of the loaded message

    if (!msgWindow) {
#ifdef DEBUG_onLoad
      BiDiMailUI.JSConsoleService.logStringMessage("couldn't get msgWindow");
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
      BiDiMailUI.JSConsoleService.logStringMessage("couldn't get DOMDocument");
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
      BiDiMailUI.JSConsoleService.logStringMessage("couldn't get DOMDocument body");
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

    var displayedMessageSubject;
    try {
      // This is a very volatile piece of code; it may very well differ
      // between TB and SM and between versions, with extensions such as
      // Mnenhy etc.
      var expandedSubjectBox = document.getElementById('expandedsubjectBox');
      if (expandedSubjectBox.hasAttribute("headervalue")) {
        displayedMessageSubject = expandedSubjectBox.getAttribute("headervalue");
      } 
      else {
        var valueNode = document.getAnonymousElementByAttribute(expandedSubjectBox,"anonid","headerValue");
        if (valueNode.firstChild) {
          displayedMessageSubject = valueNode.firstChild.data;
        }
        else displayedMessageSubject = valueNode.value;
      }
    }
    catch(ex) {
#ifdef DEBUG_onLoad
      BiDiMailUI.JSConsoleService.logStringMessage("couldn't get subject:\n" + ex);
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
          document.getElementById('expandedsubjectBox').headerValue = str;
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
  
  installComposeWindowEventHandlers : function() {
    document.getElementById("messagepane").addEventListener("load",
      BiDiMailUI.MessageOverlay.onLoad, true);
  },
  
// Functions from here on should not be used by code outside this file

  // this function is passed to the charset phase actions and run 
  // from there, but it's a UI function
  promptForDefaultCharsetChange : function() {
    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                            .getService(Components.interfaces.nsIPromptService);
    var list = [
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1255"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1256"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.leave_as_is")];
    var selected = {};

#ifdef DEBUG_promptForDefaultCharsetChange
    BiDiMailUI.JSConsoleService.logStringMessage("BiDiMailUI.Strings.GetStringFromName(\"bidimailui.charset_dialog.set_to_windows_1255\") =\n" + BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.set_to_windows_1255"));
#endif

    var ok = prompts.select(
      window,
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.window_title"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.charset_dialog.dialog_message"),
        list.length, list, selected);

    if (ok) {

#ifdef DEBUG_promptForDefaultCharsetChange
    BiDiMailUI.JSConsoleService.logStringMessage("ok!");
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
    else BiDiMailUI.JSConsoleService.logStringMessage("user cancelled the dialog box!");
#endif
    return null;
  }
  
}
