var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

BiDiMailUI.Editor = {

  loadEventCount : 0,

  windowOnLoad : function() {
    BiDiMailUI.Editor.loadEventCount += 1;
    if (BiDiMailUI.Editor.loadEventCount != 3) return; // aparently 3rd time's the charm for the editor
    BiDiMailUI.Composition.lastWindowToHaveFocus = null;

    top.controllers.insertControllerAt(1, BiDiMailUI.Composition.directionSwitchController);

    HandleComposerDirectionButtons();
    Services.prefs.addObserver(
      BiDiMailUI.Editor.directionButtonsPrefListener.domain,
      BiDiMailUI.Editor.directionButtonsPrefListener
    );

    const documentParams = {
      isEmpty: false
    };

    BiDiMailUI.Editor.determineNewDocumentParams(documentParams);
    BiDiMailUI.Composition.setInitialDocumentDirection(documentParams);

    BiDiMailUI.Composition.alternativeEnterBehavior =
      BiDiMailUI.Prefs.get("compose.alternative_enter_behavior", true);
    if (BiDiMailUI.Composition.alternativeEnterBehavior)
      BiDiMailUI.Composition.loadParagraphMode();

    BiDiMailUI.Composition.directionSwitchController.setAllCasters();
  },

  windowOnUnload : function () {
    // Stop tracking "Show Direction Buttons" pref.
    Services.prefs.removeObserver(
      BiDiMailUI.Editor.directionButtonsPrefListener.domain,
      BiDiMailUI.Editor.directionButtonsPrefListener
    );
  },

  handleComposerDirectionButtons : function () {
    const hiddenButtonsPref =
      !BiDiMailUI.Prefs.get("compose.show_direction_buttons", true);

    document.getElementById("directionality-formatting-toolbar-section")
            .setAttribute("hidden", hiddenButtonsPref);
    document.getElementById("directionality-separator-formatting-bar")
            .hidden = hiddenButtonsPref;
  },

  installEditorWindowEventHandlers : function () {
    document.addEventListener("load", BiDiMailUI.Editor.windowOnLoad, true);
    document.addEventListener("unload", BiDiMailUI.Editor.windowOnUnload, true);
    document.addEventListener("keypress", BiDiMailUI.Composition.onKeyPress, true);
    if (BiDiMailUI.Prefs.get(
      "compose.ctrl_shift_switches_direction", true)) {
      document.addEventListener("keydown", BiDiMailUI.Composition.onKeyDown, true);
      document.addEventListener("keyup", BiDiMailUI.Composition.onKeyUp, true);
    }
  },

  determineNewDocumentParams : function (messageParams) {
    const body = BiDiMailUI.getMessageEditor(document).contentDocument.body;

    try {
      if (!body.hasChildNodes()) {
        messageParams.isEmpty = true;
      } else if (body.hasChildNodes() && !body.firstChild.hasChildNodes()) {
        if ((body.firstChild == body.lastChild) &&
            (body.firstChild.nodeName == "BR")) {
          messageParams.isEmpty = true;
        }
      } else if (
        body.firstChild == body.lastChild &&
        body.firstChild.nodeName == "P" &&
        body.firstChild.firstChild.nodeName == "BR" &&
        body.firstChild.firstChild == body.firstChild.lastChild) {
        messageParams.isEmpty = true;
      }
    } catch (e) {
      // can't get elements - must be empty...
      messageParams.isEmpty = true;
    }
  }
};

BiDiMailUI.Editor.directionButtonsPrefListener = {
  domain: "extensions.bidiui.mail.compose.show_direction_buttons",
  observe: function (subject, topic, prefName) {
    if (topic != "nsPref:changed") return;
    BiDiMailUI.Editor.handleComposerDirectionButtons();
  }
};
