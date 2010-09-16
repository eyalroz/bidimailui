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

BiDiMailUI.Editor = {

  loadEventCount : 0,

  windowOnLoad : function() {
    BiDiMailUI.Editor.loadEventCount += 1;
    if (BiDiMailUI.Editor.loadEventCount != 3) return; // aparently 3rd time's the charm for the editor
    BiDiMailUI.Composition.lastWindowToHaveFocus = null;

    top.controllers.insertControllerAt(1, BiDiMailUI.Composition.directionSwitchController);

    HandleComposerDirectionButtons();
    // Track "Show Direction Buttons" pref.
    try {
      var pbi =
        BiDiMailUI.Prefs.prefService.QueryInterface(
          Components.interfaces.nsIPrefBranchInternal);
      pbi.addObserver(BiDiMailUI.Editor.directionButtonsPrefListener.domain,
                      BiDiMailUI.Editor.directionButtonsPrefListener, false);
    }
    catch(ex) {
      dump("Failed to observe prefs: " + ex + "\n");
    }

    var documentParams = {
      isEmpty: false
    };

    BiDiMailUI.Editor.determineNewDocumentParams(documentParams);
    BiDiMailUI.Composition.setInitialDocumentDirection(documentParams);
     
    BiDiMailUI.Composition.alternativeEnterBehavior =
      BiDiMailUI.Prefs.getBoolPref("compose.alternative_enter_behavior", true);
    if (BiDiMailUI.Composition.alternativeEnterBehavior)
      BiDiMailUI.Composition.loadParagraphMode();

    BiDiMailUI.Composition.directionSwitchController.setAllCasters();
  }  ,

  windowOnUnload : function () {
    // Stop tracking "Show Direction Buttons" pref.
    try {
      var pbi =
        BiDiMailUI.Prefs.prefService.QueryInterface(
          Components.interfaces.nsIPrefBranchInternal);
      pbi.removeObserver(BiDiMailUI.Editor.directionButtonsPrefListener.domain,
                         BiDiMailUI.Editor.directionButtonsPrefListener);
    }
    catch(ex) {
      dump("Failed to remove pref observer: " + ex + "\n");
    }
  },

  handleComposerDirectionButtons : function () {
    var hiddenButtonsPref =
      !BiDiMailUI.Prefs.getBoolPref("compose.show_direction_buttons", true);

    document.getElementById("directionality-formatting-toolbar-section")
            .setAttribute("hidden", hiddenButtonsPref);
    document.getElementById("directionality-separator-formatting-bar")
            .hidden = hiddenButtonsPref;
  },


  installEditorWindowEventHandlers : function () {
    document.addEventListener("load", BiDiMailUI.Editor.windowOnLoad, true);
    document.addEventListener("unload", BiDiMailUI.Editor.windowOnUnload, true);
    document.addEventListener("keypress", BiDiMailUI.Composition.onKeyPress, true);
    if (BiDiMailUI.Prefs.getBoolPref(
      "compose.ctrl_shift_switches_direction", true)) {
      document.addEventListener("keydown", BiDiMailUI.Composition.onKeyDown, true);
      document.addEventListener("keyup", BiDiMailUI.Composition.onKeyUp, true);
    }
  },

  determineNewDocumentParams : function (messageParams) {
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

BiDiMailUI.Editor.directionButtonsPrefListener = {
    domain: "bidiui.mail.compose.show_direction_buttons",
    observe: function(subject, topic, prefName) {
      if (topic != "nsPref:changed")
        return;

      BiDiMailUI.Editor.handleComposerDirectionButtons();
    }
}
