// Globals
var gLastWindowToHaveFocus;

function GetCurrentSelectionDirection()
{
  // the following 3 lines enable logging messages to the javascript console
  // by doing jsConsoleService.logStringMessage('blah')

  // netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
  // var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
  // jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

  // jsConsoleService.logStringMessage('----- in GetCurrentSelectionDirection() -----');

  // The current selection is a forest of DOM nodes,
  // each of which is contained in a block HTML
  // element (which is also a DOM node in the document
  // node tree), which has a direction.
  // We check the direction of all block elements
  // containing nodes in the selection, by traversing
  // the entire selection forest

  // Note that it is also possible to prune the scan
  // whenever a block element is reached (i.e. not
  // scan within it), but at the moment we do not do so.

  var hasLTR = false, hasRTL = false;
  var editor = GetCurrentEditor();
  try {
    if (editor.selection.rangeCount == 0)
      return null;
  }
  catch(e) {
    // the editor is apparently unavailable... although it should be available!
    return null;
  }

  view = document.defaultView;
  for (i=0; i<editor.selection.rangeCount; ++i ) {
    var range = editor.selection.getRangeAt(i);
    var node = range.startContainer;
    var cacIsLTR = false;
    var cacIsRTL = false;

    // first check the block level element which contains
    // the entire range (but don't use its direction just yet)

    cac = range.commonAncestorContainer;

    cbe = findClosestBlockElement(cac);
    switch (view.getComputedStyle(cbe, "").getPropertyValue("direction")) {
      case 'ltr': cacIsLTR = true; break;
      case 'rtl': cacIsRTL = true; break;
    }

    // jsConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nHTML:\n" + cac.innerHTML);
    // jsConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nvalue:\n" + cac.nodeValue + "\nis LTR = " + cacIsLTR + "; is RTL = " + cacIsRTL);

    if (cac.nodeType == Node.TEXT_NODE) {
      // the range is some text within a single DOM leaf node
      // so there's no need for any traversal
      // jsConsoleService.logStringMessage('just a text node, continuing');
      hasLTR = hasLTR || cacIsLTR;
      hasRTL = hasRTL || cacIsRTL;
      if (hasLTR && hasRTL)
        return 'complex';
      continue; // ... to the next range
    }

    // at this point we assume the cac nodeType is ELEMENT_NODE or something close to that...

    if (range.startContainer == cac) {
      // we assume that in this case both containers are equal to cac
      // jsConsoleService.logStringMessage('zero-depth selection, using cac direction');
      hasLTR = hasLTR || cacIsLTR;
      hasRTL = hasRTL || cacIsRTL;
      if (hasLTR && hasRTL)
        return 'complex';
      continue;
    }

    // check the start slope

    node = range.startContainer;

    while (node != cac) {
      // jsConsoleService.logStringMessage('visiting start slope node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
      if (node.nodeType == Node.ELEMENT_NODE) {
        var nodeStyle = view.getComputedStyle(node, "");
        var display = nodeStyle.getPropertyValue('display');
        if (display == 'block' || display == 'table-cell' || display == 'table-caption' || display == 'list-item' || (node.nodeType == Node.DOCUMENT_NODE)) {
          switch (nodeStyle.getPropertyValue("direction")) {
            case 'ltr':
              hasLTR = true;
              // jsConsoleService.logStringMessage('found LTR');
              if (hasRTL) return 'complex';
              break;
            case 'rtl':
              hasRTL = true;
              // jsConsoleService.logStringMessage('found RTL');
              if (hasLTR) return 'complex';
              break;
          }
        }
      }
      node = node.parentNode;
    }

    // check all nodes from startContainer to endContainer

    node = range.startContainer;
    do
    {
      // jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);

      // check the current node's direction

      // Note: a node of type TEXT_NODE will not be checked for direction,
      //       nor will it trigger the use of the cac's direction!


      if (node.nodeType == Node.ELEMENT_NODE)
      {
        var nodeStyle = view.getComputedStyle(node, "");
        var display = nodeStyle.getPropertyValue('display');
        if (display == 'block' || display == 'table-cell' || display == 'table-caption' || display == 'list-item' || (node.nodeType == Node.DOCUMENT_NODE)) {
          switch (nodeStyle.getPropertyValue("direction")) {
            case 'ltr':
              hasLTR = true;
              // jsConsoleService.logStringMessage('found LTR');
              if (hasRTL) return 'complex';
              break;
            case 'rtl':
              hasRTL = true;
              // jsConsoleService.logStringMessage('found RTL');
              if (hasLTR) return 'complex';
              break;
          }
        }
        else if (node.parentNode == cac) {
          // there is a non-block child of cac, so we use cac's data
          // jsConsoleService.logStringMessage('using cac direction');
          hasLTR = hasLTR || cacIsLTR;
          hasRTL = hasRTL || cacIsRTL;
          if (hasLTR && hasRTL) {
            // jsConsoleService.logStringMessage('returning complex');
            return 'complex';
          }
        }
      }


      // is there is a child node which need be traversed?

      if (node.firstChild ) {
        // jsConsoleService.logStringMessage('descending to first child');
        node = node.firstChild;
        // fallthrough to sibling search in case first child is a text node
        if  (node.nodeType != Node.TEXT_NODE)
          continue; // we've found the next node to visit
      }

      // is there a node on the ancestry path from this node
      // (inclusive) to the common range ancestor which has a sibling node
      // which need be traversed?

      do {
         if (node.nextSibling) {
           node = node.nextSibling;
           // jsConsoleService.logStringMessage('moving to next sibling');
           if  (node.nodeType != Node.TEXT_NODE)
             break; // we've found the next node to visit
           else continue; // try the next sibling
         }
         else node = node.parentNode;
         // jsConsoleService.logStringMessage('moving back up');
       } while (node != cac);

     } while (node != cac);
   }

  if (hasLTR && hasRTL)
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

  // Direction Buttons
  HandleDirectionButtons();

  // our extension likes paragraph text entry, not 'body text' - since
  // paragraph are block elements, with a direction setting
  if (editorType == 'htmlmail') {
    try {
      doStatefulCommand('cmd_paragraphState', "p");
    } catch(e) {
      // since the window is not 'ready', something might throw
      // an exception here, like inability to focus etc.
    }
  }

  // the following is a very ugly hack!
  // the reason for it is that without a timeout, it seems
  // that gMsgCompose does often not yet exist when
  // the OnLoad handler runs...
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 125);
}

function HandleDirectionButtons()
{
  var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
  var editorType = GetCurrentEditorType();

  if (editorType == 'htmlmail')
  {
    var hiddenbuttons = false;
    try {
      if (!prefs.getBoolPref('mail.compose.show_direction_buttons'))
        hiddenbuttons = true;
    }
    catch(e) { } // preference is not set.

    // Note: the main toolbar buttons are never hidden, since that toolbar
    //       is customizable in tbird anyway
    document.getElementById('ltr-paragraph-direction-broadcaster').setAttribute('hidden',hiddenbuttons);
    document.getElementById('rtl-paragraph-direction-broadcaster').setAttribute('hidden',hiddenbuttons);
    document.getElementById('directionality-separator-formatting-bar').setAttribute('hidden',hiddenbuttons);   
  }
}

function composeWindowEditorOnReopenHandler() {
  // Direction Buttons
  HandleDirectionButtons();

  // another ugly hack (see composeWindowEditorOnLoadHandler):
  // if we don't delay before running the other handler, the
  // message text will not be available so we will not know
  // whether or not this is a reply
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 125);
}

function composeWindowEditorDelayedOnLoadHandler() {
  var editorType = GetCurrentEditorType();
  var body = document.getElementById('content-frame').contentDocument.body;

  // Handle message direction
  var messageIsAReply = false;
  try {
    messageIsAReply = (gMsgCompose.originalMsgURI.length > 0);
  }
  catch(e) {};

  try
  {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

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
    
  // Don't change the behavior outside the message content
  if (top.document.commandDispatcher.focusedWindow != content)
    return;

  // Steal all plain enters without modifiers (e.g. do not change
  // behaivor of Shift+Enter which inserts a <br>, Ctrl+Enter which
  // sends the message etc.)
  if ((ev.keyCode == KeyEvent.DOM_VK_ENTER || ev.keyCode == KeyEvent.DOM_VK_RETURN) && !ev.shiftKey && !altKey && !ctrlKey && !metaKey && !isInList())
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

  // ------------------------------- "remember old style" ------
  // will be ignord
  var allHas = { value: false };
  var anyHas = { value: false };

  var isStyleBold = { value: false };
  EditorGetTextProperty("b", "", "", isStyleBold, anyHas, allHas);
  var isStyleItalic = { value: false };
  EditorGetTextProperty("i", "", "", isStyleItalic, anyHas, allHas);
  var isStyleUnderline = { value: false };
  EditorGetTextProperty("u", "", "", isStyleUnderline, anyHas, allHas);
  var isStyleTT = { value: false };
  EditorGetTextProperty("tt", "", "", isStyleTT, anyHas, allHas);
  var isStyleFontFace = { value: false };
  EditorGetTextProperty("font", "face", "", isStyleFontFace, anyHas, allHas);
  var styleFontFace;
  styleFontFace = editor.getFontFaceState(allHas);
  var isStyleFontColor = { value: false };
  EditorGetTextProperty("font", "color", "", isStyleFontColor, anyHas, allHas);
  var styleFontColor = editor.getFontColorState(allHas);
  // solution for <big>, <small> and font-face tags:
  // we compare the computed font-size of the selction to the font-size of
  // its block element. If it is different, we'll apply font-size
  var isStyleFontSize = { value: false };
  var styleFontSize;
  try
  {
    styleFontSize = document.defaultView.getComputedStyle(editor.getSelectionContainer(), "").getPropertyValue("font-size");
    isStyleFontSize.value = (styleFontSize != document.defaultView.getComputedStyle(findClosestBlockElement(editor.getSelectionContainer()), "").getPropertyValue("font-size"));
  }
  catch (e) {}
  // ------------------------------- "remember old style" ------


  // getParagraphState returns the paragraph state for the selection.
  // A "new line" operation nukes the current selection.
  // We want 'getParagraphState' to test the paragraph which the
  // cursor would be on after the nuking, so we nuke it ourselves first.
  var isParMixed = { value: false }; // would be ignored
  var parState;
  parState = editor.getParagraphState(isParMixed);

  if (parState == "")
    editor.setParagraphFormat("p");
  editor.insertLineBreak();
  editor.setParagraphFormat("p");
  var par = findClosestBlockElement(editor.selection.focusNode);
  var prevPar = par.previousSibling;

  // Hunt down and shoot the extra BR. We don't want it.
  // Go up to the last child.
  // e.g. <p><b>foo<br></b></p> -- we accend to B, then to BR.
  for (var node = prevPar.lastChild; node && node.lastChild; node = node.lastChild);
  // Make sure:
  // 1. It's a BR,
  // 2. It's not the special case of the BR being an only child (thus
  //    not a candidate for removal -- we need it to keep the P
  //    from becoming empty)
  if (node && (node.nodeType == node.ELEMENT_NODE) && (node.tagName.toLowerCase() == "br") && prevPar.firstChild != node)
  {
   editor.deleteNode(node);
  }

  editor.endTransaction();

  // ------------------------------- "set old style" ------
  if (isStyleBold.value)
    EditorSetTextProperty("b", "", "");
  if (isStyleItalic.value)
    EditorSetTextProperty("i", "", "");
  if (isStyleUnderline.value)
    EditorSetTextProperty("u", "", "");
  if (isStyleTT.value)
    EditorSetTextProperty("tt", "", "");
  if (isStyleFontFace.value) // font-face can't be "mixed": there is no selected text
    EditorSetTextProperty("font", "face", styleFontFace);
  if (isStyleFontColor.value) // same as above
    EditorSetTextProperty("font", "color", styleFontColor);
  if (isStyleFontSize.value)
    // we have css value, set it as a span
    EditorSetTextProperty("span", "style", "font-size: " + styleFontSize);

  // If the previous paragraph has a dir attribute, apply it to the new paragraph
  try {
    if (prevPar.hasAttribute("dir"))
      editor.setAttribute(par, "dir", prevPar.dir);
  }
  catch (er) {}
  // ------------------------------- "set old style" ------
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
        dir = GetCurrentSelectionDirection();
        if (dir == 'rtl')
          return 'checked';
        else
          return 'unchecked';
      case "cmd_ltr_paragraph":
        dir = GetCurrentSelectionDirection();
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
