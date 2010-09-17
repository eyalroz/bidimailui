/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the HebMailPack extension.
 *
 * The Initial Developer of the Original Code is Moofie.
 *
 * Portions created by the Initial Developer are Copyright (C) 2004-2006
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Eyal Rozenberg <eyalroz@technion.ac.il>
 *   Asaf Romano <mozilla.mano@sent.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// This file constains UI and glue code only, calling
// display logic code elsewhere actually act on the displayed message


BiDiMailUI.MessageOverlay = {
  // We set this flag before reloading a message due to 
  // character set mis-detection, to prevent repeated reloading
  dontReload : false,

  cycleDirectionSettings : function() {
    var messagePane = document.getElementById("messagepane");
    var body = messagePane.contentDocument.body;
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
      msgHdr = messenger.msgHdrFromURI(gFolderDisplay.selectedMessageUris[0]);
    }

    var charsetPhaseParams = {
      body: domDocument.body,
      charsetOverrideInEffect: msgWindow.charsetOverride,
      currentCharset: msgWindow.mailCharacterSet,
      messageHeader: msgHdr,
      unusableCharsetHandler : BiDiMailUI.MessageOverlay.promptForDefaultCharsetChange,
      needCharsetForcing: false, // this is an out parameter
      charsetToForce: null       // this is an out parameter
    };
    BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection(charsetPhaseParams);
    if (charsetPhaseParams.needCharsetForcing) {
      MessengerSetForcedCharacterSet(charsetPhaseParams.charsetToForce);
      BiDiMailUI.MessageOverlay.dontReload = true;
      // we're reloading with a different charset, don't do anything else
      return;
    }
    BiDiMailUI.MessageOverlay.dontReload = false; // clearing BiDiMailUI.MessageOverlay.dontReload for other messages

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
      BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1255"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1256"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.leave_as_is")];
    var selected = {};

#ifdef DEBUG_promptForDefaultCharsetChange
    BiDiMailUI.JSConsoleService.logStringMessage("BiDiMailUI.Strings.GetStringFromName(\"bidimailui.chraset_dialog.set_to_windows_1255\") =\n" + BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1255"));
#endif

    var ok = prompts.select(
      window,
      BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.window_title"),
      BiDiMailUI.Strings.GetStringFromName("bidimailui.chraset_dialog.dialog_message"),
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
          str.data = charsetPref = "windows-1255";
          BiDiMailUI.Prefs.prefService.setComplexValue("mailnews.view_default_charset", 
            Components.interfaces.nsISupportsString, str);
          return str.data;
        case 1:
          str.data = charsetPref = "windows-1256";
          BiDiMailUI.Prefs.prefService.setComplexValue("mailnews.view_default_charset", 
                Components.interfaces.nsISupportsString, str);
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


