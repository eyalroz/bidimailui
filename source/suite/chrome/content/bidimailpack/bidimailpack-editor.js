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
