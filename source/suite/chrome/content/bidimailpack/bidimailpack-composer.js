// Summary of differences from tbird version:
//
// button visibility set in loadhandler2 rather than loadhander (perhaps this should also
// be the case for tbird)
// XUL differences have, for now, no reflection in script differences

// Globals
var gLastWindowToHaveFocus;

function GetCurrentParagraphDirection()
{
  var hasLTR = false, hasRTL = false;
  var editor = GetCurrentEditor();
  try {
    if (editor.selection.rangeCount > 0)
    {
      view = document.defaultView;
      for (i=0; i<editor.selection.rangeCount; ++i)
      {
        var range = editor.selection.getRangeAt(i);
        var node = range.startContainer;
        // walk the tree till we find the endContainer of the selection range,
        // giving our directionality style to everything on our way
        do
        {
          var closestBlockElement = findClosestBlockElement(node);
          if (closestBlockElement)
          {
            var computedDir = view.getComputedStyle(closestBlockElement, "").getPropertyValue("direction");
            switch (computedDir)
            {
              case 'ltr':
                hasLTR = true;
                break;
              case 'rtl':
                hasRTL = true;
                break;
            }
          }
          // This check should be placed here, not as the 'while'
          // condition, to handle cases where begin == end
          if (node == range.endContainer)
            break;
          if (node.firstChild)
            node = node.firstChild;
          else if (node.nextSibling)
            node = node.nextSibling;
          else
            // find a parent node which has anything after
            while (node = node.parentNode)
            {
              if (node.nextSibling)
              {
                node = node.nextSibling;
                break;
              }
            }
        }
        while (node)
      }
    }
  } catch(e) {
    // perhaps editor is not available? No idea why...
  }

  if ((hasLTR && hasRTL) || (!hasLTR && !hasRTL))
    return 'complex';

  if (hasRTL)
    return 'rtl';
  if (hasLTR)
    return 'ltr';

  return null;
}

function SetDocumentDirection(dir) {
  var body = document.getElementById('content-frame').contentDocument.body;
  body.setAttribute('dir', dir);
}

function InsertControlCharacter(controlCharacter) {
  editor = GetCurrentEditor();
  editor.beginTransaction();
  editor.insertText(controlCharacter);
  editor.endTransaction();
}

function SwitchDocumentDirection() {
  var currentDir;

  var body = document.getElementById('content-frame').contentDocument.body;
  currentDir = body.getAttribute("dir");

  if ((currentDir == 'rtl') || (currentDir == 'RTL'))
    directionSwitchController.doCommand("cmd_ltr_document");
  else
    directionSwitchController.doCommand("cmd_rtl_document");
}

function composeWindowEditorOnLoadHandler() {
  // intl' globals
  gLastWindowToHaveFocus = null;

  var editorType = GetCurrentEditorType();

  // Direction Controller
  top.controllers.insertControllerAt(1, directionSwitchController);

  // decide which direction switch item should appear in the context menu -
  // the switch for the whole document or for the current paragraph
  document.getElementById('contextSwitchParagraphDirectionItem').setAttribute('hidden', editorType != 'htmlmail');
  document.getElementById('contextBodyDirectionItem').setAttribute('hidden', editorType == 'htmlmail');

  // the following is a very ugly hack!
  // the reason for it is that without a timeout, it seems
  // that gMsgCompose does often not yet exist when
  // the OnLoad handler runs...
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 0);
}


function composeWindowEditorOnReopenHandler() {
  // another ugly hack (see composeWindowEditorOnLoadHandler):
  // if we don't delay before running the other handler, the
  // message text will not be available so we will not know
  // whether or not this is a reply
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 0);
}

function composeWindowEditorDelayedOnLoadHandler() {
  
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  var body = document.getElementById('content-frame').contentDocument.body;


  var messageIsAReply = false;
  try {
    messageIsAReply = (gMsgCompose.originalMsgURI.length > 0);
  }
  catch(e) {};
  var editorType = GetCurrentEditorType();

  // decide which direction buttons are shown and which aren't

  var hiddenButtons = false;
  try {
    if (!prefs.getBoolPref('mail.compose.show_direction_buttons'))
      hiddenButtons = true;
  }
  catch(e) { } // preference is not set.

  // Note: the document direction casters default to being hidden

  if (editorType == 'htmlmail')
  {
    document.getElementById('ltr-paragraph-direction-broadcaster').setAttribute('hidden',hiddenButtons);
    document.getElementById('rtl-paragraph-direction-broadcaster').setAttribute('hidden',hiddenButtons);
  }
  else {
    // plain text mail
    document.getElementById('ltr-document-direction-broadcaster').setAttribute('hidden',hiddenButtons);
    document.getElementById('rtl-document-direction-broadcaster').setAttribute('hidden',hiddenButtons);
  }

  try
  {
    // New message OR "Always reply in default direction" is checked
    if (!messageIsAReply || prefs.getBoolPref("mailnews.reply_in_default_direction") )
    {
      try
      {
        var defaultDirection = prefs.getCharPref("mailnews.send_default_direction");
        // aligning to default direction
        if ((defaultDirection == 'rtl') || (defaultDirection == 'RTL'))
          SetDocumentDirection('rtl');
        else
          SetDocumentDirection('ltr');

        // the initial setting; perhaps instead of this
        // we should have an 'init' method for the controller?
        directionSwitchController.setAllCasters();

        return;

      } catch(e1) {
        // preference is not set.
      }
    }
  } catch(e2) {
    // reply_in_default_direction preference is not set.
    // we choose "reply_in_default_direction==true" as the default
    // note that since the logic is short-circuit, if this is not a reply we
    // can't get here
  }

  // aligning in same direction as message
  if (hasRTLWord(body))
    SetDocumentDirection('rtl');
  else
    SetDocumentDirection('ltr');

  directionSwitchController.setAllCasters();
}

function InstallComposeWindowEditorHandler() {

  // problem: if I add a handler for both events, than the first time
  // a composer window is opened, the handler runs twice; but if I only
  // add a handler for compose-window-reopen, the first time a composer
  // window is opened the handler does not run even once

  document.addEventListener('load', composeWindowEditorOnLoadHandler, true);
  document.addEventListener('compose-window-reopen', composeWindowEditorOnReopenHandler, true);
  document.addEventListener('keypress', onKeyPress, true);
}

function findClosestBlockElement(node)
{
  // Try to locate the closest ancestor with display:block
  var v = node.ownerDocument.defaultView;
  while (node)
  {
    if (node.nodeType == node.ELEMENT_NODE)
    {
      var display = v.getComputedStyle(node, "").getPropertyValue('display');
      if (display == 'block' || display == 'table-cell' || display == 'table-caption' || display == 'list-item')
        return node;
    }
    node = node.parentNode;
  }
  return node;
}


function ApplyToSelectionBlockElements(evalStr)
{
  var editor = GetCurrentEditor();
  if (!editor)
  {
    alert("Could not acquire editor object.");
    return;
  }

  if (editor.selection.rangeCount > 0)
  {
    editor.beginTransaction();
    try {
    for (i=0; i<editor.selection.rangeCount; ++i)
    {
      var range = editor.selection.getRangeAt(i);
      var node = range.startContainer;
      // walk the tree till we find the endContainer of the selection range,
      // giving our directionality style to everything on our way
      do
      {
        var closestBlockElement = findClosestBlockElement(node);
        if (closestBlockElement)
        {
          eval(evalStr);
        }
        else
          break;

        // This check should be placed here, not as the 'while'
        // condition, to handle cases where begin == end
        if (node == range.endContainer)
          break;

        // Traverse through the tree in order
        if (node.firstChild)
          node = node.firstChild;
        else if (node.nextSibling)
          node = node.nextSibling;
        else
          // find a parent node which has anything after
          while (node = node.parentNode)
          {
            if (node.nextSibling)
            {
              node = node.nextSibling;
              break;
            }
          }
      }
      while(node);
    }
    } finally { editor.endTransaction(); }
  }
}

function ClearParagraphDirection()
{
  var evalStr = 'editor.removeAttribute(closestBlockElement, \'dir\');';
  ApplyToSelectionBlockElements(evalStr);
}


function SetParagraphDirection(dir)
{
  var evalStr = 'editor.setAttribute(closestBlockElement, \'dir\', \'' + dir + '\');';
  ApplyToSelectionBlockElements(evalStr);
}

function SwitchParagraphDirection()
{
  var evalStr =
    'var dir = (closestBlockElement.ownerDocument.defaultView.getComputedStyle(closestBlockElement, "").getPropertyValue("direction") == "rtl"? "ltr" : "rtl");' +
    'editor.setAttribute(closestBlockElement, \'dir\', dir);';
  ApplyToSelectionBlockElements(evalStr);
}


function onKeyPress(ev)
{
  // Don't change the behavior for text-plain messages
  var editorType = GetCurrentEditorType();
  if (editorType != 'htmlmail')
    return;

  // Steal all Enters but Shift-Enters. Shift-Enters should insert BR, as usual.
  if ((ev.keyCode == KeyEvent.DOM_VK_ENTER || ev.keyCode == KeyEvent.DOM_VK_RETURN) && !ev.shiftKey  && !isInList())
  {
    // Do whatever it takes to prevent the editor from inserting a BR
    ev.preventDefault();
    ev.stopPropagation();
    ev.initKeyEvent("keypress", false, true, null, false, false, false, false, 0, 0);

    // ... and insert a paragraph break instead
    InsertParagraph();
  }
}

function isInList()
{
  var editor = GetCurrentEditor();
  editor.beginTransaction();

  var isListMixed = new Object;
  var isListOl = new Object;
  var isListUl = new Object;
  var isListDl = new Object;
  editor.getListState(isListMixed, isListOl, isListUl, isListDl);
  editor.endTransaction();

  if (isListOl.value || isListUl.value || isListDl.value)
    return true;
  else
    return false;
}

// Will attempt to break the current line into two paragraphs (unless we're in a list).
function InsertParagraph()
{
  var editor = GetCurrentEditor();
  if (!editor)
  {
    alert("Could not acquire editor object.");
    return;
  }

  editor.beginTransaction();

  if (!editor.selection.isCollapsed)
   editor.deleteSelection(editor.eNone);

  // getParagraphState returns the paragraph state for the selection.
  // A "new line" operation nukes the current selection.
  // We want 'getParagraphState' to test the paragraph which the
  // cursor would be on after the nuking, so we nuke it ourselves first.

  var isParMixed = new Object; // would be ignored
  var parState;
  parState = editor.getParagraphState(isParMixed);

  if (parState == "")
    editor.setParagraphFormat("p");
  editor.insertLineBreak();
  editor.setParagraphFormat("p");
  var par = findClosestBlockElement(editor.selection.focusNode);
  var prevPar = par.previousSibling;

  // Hunt and shoot the extra BR. We don't want it.
  var node = prevPar.lastChild;
  if (node && (node.nodeType == node.ELEMENT_NODE) && (node.tagName.toUpperCase() == "BR") && (prevPar.childNodes.length > 1))
    editor.deleteNode(node);

  editor.endTransaction();
}

var directionSwitchController =
{
  supportsCommand: function(command)
  {
    switch (command)
    {
      case "cmd_rtl_paragraph":
      case "cmd_ltr_paragraph":
      case "cmd_rtl_document":
      case "cmd_ltr_document":
      case "cmd_switch_paragraph":
      case "cmd_switch_document":
      case "cmd_clear_paragraph_dir":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled: function(command)
  {
    var rv = true;
    // and now for what this function is actually supposed to do...
    switch (command)
    {
      case "cmd_switch_paragraph":
      case "cmd_clear_paragraph_dir":
      case "cmd_rtl_paragraph":
      case "cmd_ltr_paragraph":
      case "cmd_rtl_document":
      case "cmd_ltr_document":
      case "cmd_switch_document":
        // editor focused?
        rv = (content == top.document.commandDispatcher.focusedWindow);

        // due to the ridiculous design of the controller interface,
        // the isCommandEnabled function has side-effects! and we
        // must use it to update button states because no other
        // method gets called to do that
        this.setCaster(command);
        break;
      default:
        rv = false;
    }

    return rv;
  },

  getState: function(command)
  {
    var dir;

    switch (command)
    {
      case "cmd_rtl_paragraph":
        dir = GetCurrentParagraphDirection();
        if (dir == 'rtl')
          return 'checked';
        else
          return 'unchecked';
      case "cmd_ltr_paragraph":
        dir = GetCurrentParagraphDirection();
        if (dir == 'ltr')
          return 'checked';
        else
          return 'unchecked';
      // the body dir is always set either to ltr or rtl
      case "cmd_rtl_document":
        return ((document.getElementById('content-frame').contentDocument.body.dir == 'rtl') ? 'checked' : 'unchecked');
      case "cmd_ltr_document":
        return ((document.getElementById('content-frame').contentDocument.body.dir == 'ltr') ? 'checked' : 'unchecked');
    }
    return null;
  },

  setCaster: function(command)
  {
    switch (command)
    {
      case "cmd_rtl_paragraph":
        caster = 'rtl-paragraph-direction-broadcaster';
        break;
      case "cmd_ltr_paragraph":
        caster = 'ltr-paragraph-direction-broadcaster';
        break;
      case "cmd_rtl_document":
        caster = 'rtl-document-direction-broadcaster';
        break;
      case "cmd_ltr_document":
        caster = 'ltr-document-direction-broadcaster';
        break;
      default:
        return;
    }
    var state = this.getState(command);

    document.getElementById(caster).setAttribute('checked', (state == 'checked') );
    document.getElementById(caster).setAttribute('disabled', (content != top.document.commandDispatcher.focusedWindow) );
  },

  setAllCasters: function()
  {
    this.setCaster("cmd_ltr_document");
    this.setCaster("cmd_rtl_document");
    this.setCaster("cmd_ltr_paragraph");
    this.setCaster("cmd_rtl_paragraph");
  },

  doCommand: function(command)
  {
    switch (command)
    {
      case "cmd_rtl_paragraph":
        SetParagraphDirection('rtl');
        break;
      case "cmd_ltr_paragraph":
        SetParagraphDirection('ltr');
        break;
      case "cmd_rtl_document":
        SetDocumentDirection('rtl');
        break;
      case "cmd_ltr_document":
        SetDocumentDirection('ltr');
        break;
      case "cmd_switch_paragraph":
        SwitchParagraphDirection();
        break;
      case "cmd_switch_document":
        SwitchDocumentDirection();
        break;
      case "cmd_clear_paragraph_dir":
        ClearParagraphDirection();
        break;
      default:
        return false;
    }
    this.setAllCasters();
  }
}


function CommandUpdate_MsgComposeDirection()
{
  var focusedWindow = top.document.commandDispatcher.focusedWindow;
 
  // we're just setting focus to where it was before
  if (focusedWindow == gLastWindowToHaveFocus) {
    return;
  }
 
  gLastWindowToHaveFocus = focusedWindow;
  directionSwitchController.setAllCasters();
}