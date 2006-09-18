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
 * The Original Code is the BiDi Mail UI extension.
 *
 * The Initial Developer of the Original Code is Eyal Rozenberg.
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

function EditorWindowOnLoad() {
  gLoadEventCount += 1;
  if (gLoadEventCount != 3) return; // aparently 3rd time's the charm for the editor
  gLastWindowToHaveFocus = null;

  top.controllers.insertControllerAt(1, directionSwitchController);

  HandleComposerDirectionButtons();
  // Track "Show Direction Buttons" pref.
  try {
    var pbi =
      gBDMPrefs.prefService
               .QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    pbi.addObserver(gEditorDirectionButtonsPrefListener.domain,
                    gEditorDirectionButtonsPrefListener, false);
  }
  catch(ex) {
    dump("Failed to observe prefs: " + ex + "\n");
  }

  var documentParams = {
    isEmpty: false
  };

  DetermineNewDocumentParams(documentParams);
  SetInitialDocumentDirection(documentParams);
   
  gAlternativeEnterBehavior =
    gBDMPrefs.getBoolPref("compose.alternative_enter_behavior", true);
  if (gAlternativeEnterBehavior)
    LoadParagraphMode();

  directionSwitchController.setAllCasters();
}  

function EditorWindowOnUnload()
{
  // Stop tracking "Show Direction Buttons" pref.
  try {
    var pbi =
      gBDMPrefs.prefService
               .QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    pbi.removeObserver(gEditorDirectionButtonsPrefListener.domain,
                       gEditorDirectionButtonsPrefListener);
  }
  catch(ex) {
    dump("Failed to remove pref observer: " + ex + "\n");
  }
}

function HandleComposerDirectionButtons()
{
  var hiddenButtonsPref =
    !gBDMPrefs.getBoolPref("compose.show_direction_buttons", true);

  document.getElementById("directionality-formatting-toolbar-section")
          .setAttribute("hidden", hiddenButtonsPref);
  document.getElementById("directionality-separator-formatting-bar")
          .hidden = hiddenButtonsPref;
}


function InstallEditorWindowEventHandlers() {
  document.addEventListener("load", EditorWindowOnLoad, true);
  document.addEventListener("unload", EditorWindowOnUnload, true);
  document.addEventListener("keypress", onKeyPress, true);
}

function DetermineNewDocumentParams(messageParams) {
  var body = document.getElementById("content-frame").contentDocument.body;

  try {
    if (!body.hasChildNodes()) 
      messageParams.isEmpty = true;
    else if ( body.hasChildNodes() &&
             !body.firstChild.hasChildNodes() ) {
      if ((body.firstChild == body.lastChild) &&
          (body.firstChild.nodeName == "BR"))
        messageParams.isEmpty = true;
    }
    else {
      if (body.firstChild == body.lastChild &&
          body.firstChild.nodeName == "P" &&
          body.firstChild.firstChild.nodeName == "BR" &&
          body.firstChild.firstChild == body.firstChild.lastChild)
        messageParams.isEmpty = true;
    }
  }
  catch(e) {
    // can't get elements - must be empty...
    messageParams.isEmpty = true;
  }
}

const gEditorDirectionButtonsPrefListener =
{
  domain: "bidiui.mail.compose.show_direction_buttons",
  observe: function(subject, topic, prefName) {
    if (topic != "nsPref:changed")
      return;

    HandleComposerDirectionButtons();
  }
};
