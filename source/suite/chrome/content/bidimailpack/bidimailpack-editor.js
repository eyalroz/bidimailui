function EditorWindowOnLoad() {
  gLoadEventCount += 1;
  if (gLoadEventCount != 3) return; // aparently 3rd time's the charm for the editor
  gLastWindowToHaveFocus = null;

  top.controllers.insertControllerAt(1, directionSwitchController);

  HandleComposerDirectionButtons();

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
