var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

BiDiMailUI.Editor = {

  loadEventCount : 0,

  windowOnLoad : function() {
    BiDiMailUI.Editor.loadEventCount += 1;
    if (BiDiMailUI.Editor.loadEventCount != 3) return; // aparently 3rd time's the charm for the editor
    BiDiMailUI.Composition.lastWindowToHaveFocus = null;

    top.controllers.insertControllerAt(1, BiDiMailUI.Composition.directionSwitchController);

    HandleComposerDirectionButtons();
    BiDiMailUI.Prefs.addObserver(
      BiDiMailUI.Editor.directionButtonsPrefListener.domain,
      BiDiMailUI.Editor.directionButtonsPrefListener
    );

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
    BiDiMailUI.Prefs.removeObserver(
      BiDiMailUI.Editor.directionButtonsPrefListener.domain,
      BiDiMailUI.Editor.directionButtonsPrefListener
    );  
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
    domain: "extensions.bidiui.mail.compose.show_direction_buttons",
    observe: function(subject, topic, prefName) {
      if (topic != "nsPref:changed")
        return;

      BiDiMailUI.Editor.handleComposerDirectionButtons();
    }
}
