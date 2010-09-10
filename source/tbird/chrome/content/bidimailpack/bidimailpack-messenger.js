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


// We set this flag before reloading a message due to 
// character set mis-detection, to prevent repeated reloading
var gDontReload = false;

function cycleDirectionSettings()
{
  var browser = document.getElementById("messagepane");
  var body = browser.contentDocument.body;
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
  BDMAction_setMessageDirectionForcing(body,newForcedDirection);
  updateDirectionMenuButton(newForcedDirection);
}

function updateDirectionMenuButton(forcedDirection)
{
#ifdef DEBUG_updateDirectionMenuButton
  gJSConsoleService.logStringMessage('updateDirectionMenuButton(forcedDirection='+forcedDirection'');
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
}

function browserOnLoadHandler()
{
#ifdef DEBUG_browserOnLoadHandler
  gJSConsoleService.logStringMessage("--- browserOnLoadHandler() ---\n" +
    "message URI: " + GetLoadedMessage());
#endif

  // First, let's make sure we can poke the:
  // - message window
  // - message body
  // - URI of the loaded message

  if (!msgWindow) {
#ifdef DEBUG_browserOnLoadHandler
    gJSConsoleService.logStringMessage("couldn't get msgWindow");
#endif
    updateDirectionMenuButton(null,true);
    return;
  }
  var domDocument;
  try {
    domDocument = this.docShell.contentViewer.DOMDocument;
  }
  catch (ex) {
#ifdef DEBUG_browserOnLoadHandler
    gJSConsoleService.logStringMessage("couldn't get DOMDocument");
#endif
    dump(ex);
    return;
  }

  if ((!domDocument.baseURI) ||
      (domDocument.baseURI == "about:blank") ||
      (/^http:\/\/.*www\.mozilla.*\/start\/$/.test(domDocument.baseURI))) {
    updateDirectionMenuButton(null,true);
    return;
  }
    
  var body = domDocument.body;
  if (!body) {
#ifdef DEBUG_browserOnLoadHandler
    gJSConsoleService.logStringMessage("couldn't get DOMDocument body");
#endif
    updateDirectionMenuButton(null,true);
    return;
  }
  
  // We're assuming only one message is selected

  var msgHdr;
  try {
    msgHdr = gMessageDisplay.displayedMessage;
  } catch(ex) {
    msgHdr = messenger.msgHdrFromURI(GetLoadedMessage());
  }

  var BDMCharsetPhaseParams = {
    body: domDocument.body,
    charsetOverrideInEffect: msgWindow.charsetOverride,
    currentCharset: msgWindow.mailCharacterSet,
    needCharsetForcing: false,
    charsetToForce: null,
    messageHeader: msgHdr
  };
  BDMActionPhase_charsetMisdetectionCorrection(BDMCharsetPhaseParams);
  if (BDMCharsetPhaseParams.needCharsetForcing) {
    MessengerSetForcedCharacterSet(BDMCharsetPhaseParams.charsetToForce);
    gDontReload = true;
    // we're reloading with a different charset, don't do anything else
    return;
  }
  gDontReload = false; // clearing gDontReload for other messages

  BDMActionPhase_htmlNumericEntitiesDecoding(body);
  BDMActionPhase_quoteBarsCSSFix(domDocument);
  BDMActionPhase_directionAutodetection(domDocument);

  updateDirectionMenuButton(null);
}    

function InstallBrowserHandler()
{
  var browser = document.getElementById("messagepane");
  if (browser)
    browser.addEventListener("load", browserOnLoadHandler, true);
}
