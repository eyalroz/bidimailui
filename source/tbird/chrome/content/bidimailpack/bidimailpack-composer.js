// A note for debugging the code
// ---------------------------------------
// the following 3 lines enable logging messages to the javascript console:
//
// netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
// var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
// jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);
//
// here is an example of a console log message describing a DOM node:
// jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);


// Globals
var gPrefService = null;
var gLastWindowToHaveFocus; // used to prevent doing unncessary work when a focus
                            // 'changes' to the same window which is already in focus
var gAlternativeEnterBehavior = true;
                            // the default behavior of the Enter key in HTML mail messages
                            // is to insert a <br>; the alternative behavior we implement
                            // is to close a paragraph and begin a new one
var gParagraphVerticalMargin; // how much space to add to paragraphs in HTML mail messages
var gBug262497Workaround;   // a boolean value which is true if we need to be applying
                            // our workaround for bugzilla bug 262497 (the behaviour 
                            // of Ctrl+Home and Ctrl+End)

function GetCurrentSelectionDirection() {
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

  var view = document.defaultView;
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

    // at this point we assume the cac nodeType is ELEMENT_NODE or something close to that

    if (range.startContainer == cac) {
      // we assume that in this case both containers are equal to cac;
      // however, we will still traverse the tree below cac, in case
      // some of its descendents have a direction different than its own
      
      // also, we need a special case for when the user has 'selected all',
      // in which case the range.startContainer == range.endContainer == cac == body,
      // but the body may have a different direction than all the paragraphs
      
      if ( cac.nodeName != "BODY" ||
          !cac.firstChild ) { // if the body has no children, only its direction counts...
        hasLTR = hasLTR || cacIsLTR;
        hasRTL = hasRTL || cacIsRTL;
      }
      if (hasLTR && hasRTL)
        return 'complex';
      if (!cac.firstChild ) {
        // no cac descendents to traverse...
        continue;
      }
    }
    else {
      // check the start slope from the range start to the cac

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
    } 
    
    // check all nodes from startContainer to endContainer (or below the cac)

    if (range.startContainer == cac)
      node = cac.firstChild;
    else node = range.startContainer;

    do {
      // jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);

      // check the current node's direction

      // Note: a node of type TEXT_NODE will not be checked for direction,
      //       nor will it trigger the use of the cac's direction!


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
        else if (node.parentNode == cac) {
          // there is a non-block child of cac, so we use cac's data
          // jsConsoleService.logStringMessage('non-block child of cac, using cac direction');
          hasLTR = hasLTR || cacIsLTR;
          hasRTL = hasRTL || cacIsRTL;
          if (hasLTR && hasRTL)
            return 'complex';
        }
      }

      if (node == range.endContainer) {
        // jsConsoleService.logStringMessage('at end container, stopping traversal');
        break; // proceed to the next selection range
      }

      // is there is a child node which need be traversed?

      if (node.firstChild ) {
        // jsConsoleService.logStringMessage('descending to first child');
        node = node.firstChild;
        // fallthrough to sibling search in case first child is a text node
        if  (node.nodeType != Node.TEXT_NODE)
          continue; // we've found the next node to visit
        else if (node == range.endContainer) {
          // jsConsoleService.logStringMessage('at TEXT_NODE endContainer, stopping traversal');        
          break; // if the next node is the end container as well as a
                 // text node, we don't need to to check its direction,
                 // but we do need to stop the traversal
        }
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

  } // end of the 'for' over the different selection ranges

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
  gPrefService = Components.classes["@mozilla.org/preferences-service;1"].getService
                         (Components.interfaces.nsIPrefBranch);

  var editorType = GetCurrentEditorType();

  // Direction Controller
  top.controllers.insertControllerAt(1, directionSwitchController);

  // decide which direction switch item should appear in the context menu -
  // the switch for the whole document or for the current paragraph
  document.getElementById('contextSwitchParagraphDirectionItem').setAttribute('hidden', editorType != 'htmlmail');
  document.getElementById('contextBodyDirectionItem').setAttribute('hidden', editorType == 'htmlmail');

  // Direction Buttons
  HandleDirectionButtons();
  // reply CSS
  HandleComposeReplyCSS();

  // the following is a very ugly hack!
  // the reason for it is that without a timeout, it seems
  // that gMsgCompose does often not yet exist when
  // the OnLoad handler runs...
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 125);
}

function HandleComposeReplyCSS() {
  var editorType = GetCurrentEditorType();

  if (editorType == 'htmlmail') {
    var editor = GetCurrentEditor();
    if (!editor) {
      alert("Could not acquire editor object.");
      return;
    }

    editor.QueryInterface(nsIEditorStyleSheets);
    editor.addOverrideStyleSheet("chrome://bidimailpack/content/quotebar.css");
  }
}

function HandleDirectionButtons() {
  var editorType = GetCurrentEditorType();

  if (editorType == 'htmlmail') {
    var hiddenbuttons = false;
    try {
      if (!gPrefService.getBoolPref('mail.compose.show_direction_buttons'))
        hiddenbuttons = true;
    }
    catch(e) { } // preference is not set.

    // Note: the main toolbar buttons are never hidden, since that toolbar
    //       is customizable in tbird anyway
    document.getElementById('ltr-paragraph-direction-broadcaster').setAttribute('hidden',hiddenbuttons);
    document.getElementById('rtl-paragraph-direction-broadcaster').setAttribute('hidden',hiddenbuttons);
    document.getElementById('directionality-separator-formatting-bar').setAttribute('hidden',hiddenbuttons);   
  }

  // TB ONLY: allow mac-specific style-rules (see bidimailpack.css in skin/classic/)
  LoadOSAttributeOnWindow();
}

function LoadParagraphMode() {
  var editorType = GetCurrentEditorType();
  if (editorType != 'htmlmail')
    return;

  // Determine Enter key behavior
  try {
    gAlternativeEnterBehavior =
        gPrefService.getBoolPref("mailnews.alternative_enter_behavior");
  }
  catch(e) {} // pref probably not set

  if (!gAlternativeEnterBehavior)
    return;

  // Get the vertical margin pref for paragraphs we add
  // We use global variables in order to avoid different margins in the same document
  gParagraphVerticalMargin = getParagraphMarginFromPref("mailnews.paragraph.vertical_margin");

  // our extension likes paragraph text entry, not 'body text' - since
  // paragraph are block elements, with a direction setting
  try {
    var editor = GetCurrentEditor();
    if (editor) {
      editor.setParagraphFormat("p");
      // as we don't use doStatefulCommand, we need to update the command state attribute...
      document.getElementById('cmd_paragraphState').setAttribute("state", "p");
      var par = findClosestBlockElement(editor.selection.focusNode);
      // Set Paragraph Margins
      par.style.marginTop    = gParagraphVerticalMargin;
      par.style.marginBottom = gParagraphVerticalMargin;
    }
  } catch(e) {
    // since the window is not 'ready', something might throw
    // an exception here, like inability to focus etc.
  }
}

function composeWindowEditorOnReopenHandler() {
  if (!gPrefService)
      gPrefService = Components.classes["@mozilla.org/preferences-service;1"].getService
                         (Components.interfaces.nsIPrefBranch);

  // Direction Buttons
  HandleDirectionButtons();
  // reply CSS
  HandleComposeReplyCSS();

  // another ugly hack (see composeWindowEditorOnLoadHandler):
  // if we don't delay before running the other handler, the
  // message text will not be available so we will not know
  // whether or not this is a reply
  setTimeout('composeWindowEditorDelayedOnLoadHandler();', 125);
}

function GetMessageDisplayDirection(messageURI) {
  // Note: there may be more than one window
  // which displays the message we are replying to;
  // since the enumeration is from the oldest window
  // to the newest, we'll overwrite the direction
  // setting if we find another window displaying the
  // same message; we will also overwrite the direction set
  // in a messenger window with a direction set in a
  // single message window

  var win,loadedMessageURI,brwsr,winBody,retVal;

  var windowManager = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(nsIWindowMediator);
  var messengerWindowList = windowManager.getEnumerator("mail:3pane");
  var messageWindowList = windowManager.getEnumerator("mail:messageWindow");

  while (true) {

    if (messengerWindowList.hasMoreElements())
      win = messengerWindowList.getNext();
    else if (messageWindowList.hasMoreElements())
      win = messageWindowList.getNext();
    else break;

    loadedMessageURI = win.GetLoadedMessage();
    if (loadedMessageURI != messageURI) continue;
    brwsr = win.getMessageBrowser();
    if (!brwsr) continue;
    winBody = brwsr.docShell.contentViewer.DOMDocument.body;
    retVal = win.getComputedStyle(winBody, null).direction; 
  }
  return retVal;
}

function composeWindowEditorDelayedOnLoadHandler() {
  var body = document.getElementById('content-frame').contentDocument.body;

  var re = /rv:([0-9.]+).*Gecko\/([0-9]+)/;
  var arr = re.exec(navigator.userAgent);
  var revision = arr[1];
  var build = arr[2];
  gBug262497Workaround = (build < "20041202") || (revision < "1.8a6");

  // Handle message direction
  var messageIsAReply = false;
  try {
    messageIsAReply = (gMsgCompose.originalMsgURI.length > 0);
  }
  catch(e) {};

  var originalMessageDisplayDirection;
  if (messageIsAReply)
    originalMessageDisplayDirection = GetMessageDisplayDirection(gMsgCompose.originalMsgURI);

  try {
    // New message OR "Always reply in default direction" is checked
    if (!messageIsAReply || gPrefService.getBoolPref("mailnews.reply_in_default_direction") ) {
      try {
        var defaultDirection = gPrefService.getCharPref("mailnews.send_default_direction");
        // aligning to default direction
        if ((defaultDirection == 'rtl') || (defaultDirection == 'RTL'))
          SetDocumentDirection('rtl');
        else
          SetDocumentDirection('ltr');

        LoadParagraphMode();
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

  // aligning in same direction as the original message

  if (originalMessageDisplayDirection)
    SetDocumentDirection(originalMessageDisplayDirection);
  else {
    // we shouldn't be able to get here - when replying, the original
    // window should be in existence
    if (hasRTLWord(body))
      SetDocumentDirection('rtl');
    else
      SetDocumentDirection('ltr');
  }
  
  LoadParagraphMode();
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

function findClosestBlockElement(node) {
  // Try to locate the closest ancestor with display:block
  var v = node.ownerDocument.defaultView;
  while (node) {
    if (node.nodeType == node.ELEMENT_NODE) {
      var display = v.getComputedStyle(node, "").getPropertyValue('display');
      if (display == 'block' || display == 'table-cell' || 
             display == 'table-caption' || display == 'list-item')
        return node;
    }
    node = node.parentNode;
  }
  return node;
}

function ApplyToSelectionBlockElements(evalStr) {
  // jsConsoleService.logStringMessage('----- ApplyToSelectionBlockElements() -----');
  var editor = GetCurrentEditor();
  if (!editor) {
    alert("Could not acquire editor object.");
    return;
  }

  if (editor.selection.rangeCount > 0) {
    editor.beginTransaction();
    try {
      for (i=0; i<editor.selection.rangeCount; ++i) {
        var range = editor.selection.getRangeAt(i);
        var startContainer = range.startContainer;
        var endContainer = range.endContainer;
        
        // special case: if our range is the entire body, what we want to change
        // are its children's directions, not the body direction - we have a
        // special function for that
        
        if (range.startContainer.nodeName == "BODY") {
          startContainer = range.startContainer.firstChild;
          endContainer = range.startContainer.lastChild;
        }
        
        // jsConsoleService.logStringMessage('endContainer:' + endContainer + "\ntype: " + endContainer.nodeType + "\nHTML:\n" + endContainer.innerHTML + "\nvalue:\n" + endContainer.nodeValue);

        var node = startContainer;
        // walk the tree till we find the endContainer of the selection range,
        // giving our directionality style to everything on our way
        do {
          // jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);

          var closestBlockElement = findClosestBlockElement(node);
          if (closestBlockElement) {
            // jsConsoleService.logStringMessage('found closestBlockElement:' + closestBlockElement + "\ntype: " + closestBlockElement.nodeType + "\nHTML:\n" + closestBlockElement.innerHTML + "\nvalue:\n" + closestBlockElement.nodeValue);
            eval(evalStr);
          }
          else {
            jsConsoleService.logStringMessage('could not find cbe');
            break;
          }

          // This check should be placed here, not as the 'while'
          // condition, to handle cases where begin == end
          if (node == endContainer) {
            // jsConsoleService.logStringMessage('at end container, stopping traversal');
            break;
          }

          // Traverse through the tree in order
          if (node.firstChild) {
            // jsConsoleService.logStringMessage('descending to first child');
            node = node.firstChild;
          }
          else if (node.nextSibling) {
            // jsConsoleService.logStringMessage('moving to next sibling');
            node = node.nextSibling;
          }
          else
            // find a parent node which has anything after
            while ((node = node.parentNode)) {
              // jsConsoleService.logStringMessage('moved up to parent node');
              if (node.nextSibling) {
                node = node.nextSibling;
                // jsConsoleService.logStringMessage('moved to next sibling');
                break;
              }
            }
        }
        while(node);
      }
    } finally { editor.endTransaction(); }
  }
}

function ClearParagraphDirection() {
  var evalStr = 'editor.removeAttribute(closestBlockElement, \'dir\');';
  ApplyToSelectionBlockElements(evalStr);
}

function SetParagraphDirection(dir) {
  var evalStr = 'editor.setAttribute(closestBlockElement, \'dir\', \'' + dir + '\');';
  ApplyToSelectionBlockElements(evalStr);
}

function SwitchParagraphDirection() {
  var evalStr =
    'var dir = (closestBlockElement.ownerDocument.defaultView.getComputedStyle(closestBlockElement, "").getPropertyValue("direction") == "rtl"? "ltr" : "rtl");' +
    'editor.setAttribute(closestBlockElement, \'dir\', dir);';
  ApplyToSelectionBlockElements(evalStr);
}

function onKeyPress(ev) {
  // Don't change the behavior for text-plain messages
  var editorType = GetCurrentEditorType();
  var editor = GetCurrentEditor();
  if (editorType != 'htmlmail')
    return;
    
  // Don't change the behavior outside the message content
  if (top.document.commandDispatcher.focusedWindow != content)
    return;

  // workaround for Mozilla bug 262497 - let's make Ctrl+Home and Ctrl+End
  // behave properly...
  
  if (gBug262497Workaround && ev.ctrlKey) {

    // move the caret ourselves if need be

    if (ev.keyCode == KeyEvent.DOM_VK_HOME) {
      var node = document.getElementById('content-frame').contentDocument.body;;
      do {
        node = node.firstChild;
      } while (node.hasChildNodes());
      editor.selection.collapse(node, 0);
    }
    else if (ev.keyCode == KeyEvent.DOM_VK_END) {
      var node = document.getElementById('content-frame').contentDocument.body;
      do {
        node = node.lastChild;
      } while (node.hasChildNodes());

      // XXX TODO: following is a special-case for dummy nodes at the
      //           end of a document, but there may be more possibilites
      //           for such dummy nodes which need to be taken into account

      if (node.nodeName == "BR")
        node = node.previousSibling;

      // if this is a node with text, go to the end of it
      if (node.length)
        editor.selection.collapse(node, node.length);
      else editor.selection.collapse(node, 0);
    }

    // and prevent the default behavior

    if ((ev.keyCode == KeyEvent.DOM_VK_HOME) || (ev.keyCode == KeyEvent.DOM_VK_END)) {
      // prevent default behavior
      ev.preventDefault();
      ev.stopPropagation();
      ev.initKeyEvent("keypress", false, true, null, false, false, false, false, 0, 0);
    }
  }

  if (gAlternativeEnterBehavior) {
    // Steal all plain enters without modifiers (e.g. do not change
    // behaivor of Shift+Enter which inserts a <br>, Ctrl+Enter which
    // sends the message etc.)
    if ( (ev.keyCode == KeyEvent.DOM_VK_ENTER || ev.keyCode == KeyEvent.DOM_VK_RETURN) 
         && !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !isInList()    ) {
      // but don't do this if we're not in paragraph mode...
      // (getParagraphState returns the paragraph state for the selection.)
      editor = GetCurrentEditor();
      var isParMixed = { value: false }; // would be ignored
      var parState = editor.getParagraphState(isParMixed);
      if (parState != "p")
        return;

      // Do whatever it takes to prevent the editor from inserting a BR
      ev.preventDefault();
      ev.stopPropagation();
      ev.initKeyEvent("keypress", false, true, null, false, false, false, false, 0, 0);
  
      // ... and insert a paragraph break instead
      InsertParagraph();
    }
    // If the backspace key has been pressed at this state:
    // <p>[p1 content]</p><p><caret />[p2 content]</p>
    // The expected result is
    // <p>[p1 content][p2 content]</p>
    // (NOT: <p>[p1 content]<br>[p2 content]</p> as nsIHTMLEditor's impl')
    else if (ev.keyCode == KeyEvent.DOM_VK_BACK_SPACE) {
      if (editor.selection.isCollapsed) {
        var par = findClosestBlockElement(editor.selection.focusNode);
        var prevPar = par.previousSibling;
        if ( (par) && (prevPar) &&
             (prevPar.tagName.toLowerCase() == "p") &&
             (par.tagName.toLowerCase() == "p") &&
             (isFirstTextNode(par, editor.selection.focusNode, false)) &&
             (editor.selection.focusOffset == 0) ) {

          // combine the two paragraphs into a single paragraph

          //netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
          //var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
          //jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

          //jsConsoleService.logStringMessage('unifying paragraphs\n------------------------');
          //jsConsoleService.logStringMessage('prevPar is:' + prevPar + "\ntype: " + prevPar.nodeType + "\nname: " + prevPar.nodeName + "\nHTML:\n" + prevPar.innerHTML + "\nOuter HTML:\n" + prevPar.innerHTML + "\nvalue:\n" + prevPar.nodeValue);
          //jsConsoleService.logStringMessage('par is:' + par + "\ntype: " + par.nodeType + "\nname: " + par.nodeName + "\nHTML:\n" + par.innerHTML + "\nOuter HTML:\n" + par.innerHTML + "\nvalue:\n" + par.nodeValue);

          editor.beginTransaction();
 
          var newPar = prevPar.cloneNode(true);
          var pChild = par.firstChild;
  
          // if nextPar is an 'empty' par in the sense of only having a <br> (editor idiosyncracy),
          // we won't add the extra <br>
          if ((par.childNodes.length == 1) && (pChild.nodeName == "BR")) {
            //jsConsoleService.logStringMessage('just removing an empty paragraph');
            prevPar.parentNode.removeChild(par);
          }
          
          // if the last node of the first par and the first node of the next par are both
          // text nodes, we'll unify them (DISABLED for now, since the editor is behaving weirdly;
          // this means we can now have consequent text nodes after the unification)
          //if (npChild && par.lastChild) {
          //  if ((npChild.nodeType == Node.TEXT_NODE) && (par.lastChild.nodeType == Node.TEXT_NODE)) {
          //    par.lastChild.nodeValue = par.lastChild.nodeValue + npChild.nodeValue;
          //    //jsConsoleService.logStringMessage('par.lastChild.nodeValue = \"' + par.lastChild.nodeValue + '\"');
          //    npChild = npChild.nextSibling;
          //  }
          //}
          else {
            var nc = prevPar.childNodes.length;
            while (pChild) {
              var pc2 = pChild;
              pChild = pChild.nextSibling;
              //jsConsoleService.logStringMessage('copying pcClone:' + pcClone + "\ntype: " + pcClone.nodeType + "\nname: " + pcClone.nodeName + "\nHTML:\n" + pcClone.innerHTML + "\nOuter HTML:\n" + pcClone.innerHTML + "\nvalue:\n" + pcClone.nodeValue);
              newPar.appendChild(pc2);
            }
            prevPar.parentNode.removeChild(par);
            prevPar.parentNode.replaceChild(newPar,prevPar);
            editor.selection.collapse(newPar, nc);
          }
          editor.endTransaction();
          //jsConsoleService.logStringMessage('done');
             
          ev.preventDefault();
          ev.stopPropagation();
          ev.initKeyEvent("keypress", false, true, null, false, false, false, false, 0, 0);
        }
      }  
    }
  }
}

/* Comment Me! */
function isFirstTextNode(blockElement, node, found) {
  if (node == blockElement)
    return found;

  var parentNode = node.parentNode;
  for (; node != parentNode.fisrtChild ; node=node.previousSibling)
    if (node.nodeType == node.TEXT_NODE)
      if (found)
        return false;
      else
        found = true;

  return (isFirstTextNode(blockElement, parentNode, found)); 
}

function isInList() {
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

function getParagraphMarginFromPref(basePrefName) {
  var aValue, aScale;
  try {
    aValue = gPrefService.getCharPref(basePrefName + ".value");
    aScale = gPrefService.getCharPref(basePrefName + ".scale");
  }
  catch (e) {
    // default values:
    aValue = "0"; aScale = "cm";                   
  }
  
  return (aValue+aScale);
}

// Will attempt to break the current line into two paragraphs (unless we're in a list).
function InsertParagraph() {
  var editor = GetCurrentEditor();
  if (!editor) {
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
  try {
    styleFontSize = document.defaultView.getComputedStyle(editor.getSelectionContainer(), "").getPropertyValue("font-size");
    isStyleFontSize.value = (styleFontSize != document.defaultView.getComputedStyle(findClosestBlockElement(editor.getSelectionContainer()), "").getPropertyValue("font-size"));
  }
  catch (e) {}
  // ------------------------------- "remember old style" ------

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
  if (node && (node.nodeType == node.ELEMENT_NODE) &&
          (node.tagName.toLowerCase() == "br") && prevPar.firstChild != node)
   editor.deleteNode(node);

  // Set Paragraph Margins
  par.style.marginTop    = gParagraphVerticalMargin;
  par.style.marginBottom = gParagraphVerticalMargin;
  
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
      editor.setAttribute(par, "dir", prevPar.getAttribute("dir"));
  }
  catch (er) {}
  // ------------------------------- "set old style" ------
}

var directionSwitchController = {
  supportsCommand: function(command) {
    switch (command) {
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

  isCommandEnabled: function(command) {
    // we're enabled if the editor is focused
    var rv = (content == top.document.commandDispatcher.focusedWindow);
    
    // and now for what this function is actually supposed to do...

    // due to the ridiculous design of the controller interface,
    // the isCommandEnabled function has side-effects! and we
    // must use it to update button states because no other
    // method gets called to do that

    switch (command) {
      case 'cmd_switch_paragraph':
      case 'cmd_clear_paragraph_dir':
      case 'cmd_switch_document':
        break;

      case 'cmd_ltr_document':
        this.setCasterGroup('document');
      case 'cmd_rtl_document':
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_document
        break;
      
      case 'cmd_ltr_paragraph':
        this.setCasterGroup('paragraph');
      case 'cmd_rtl_paragraph':
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_paragraph
        break;
      default:
        rv = false;
    }

    return rv;
  },

  setCasterGroup: function(casterPair) {
    var casterID, oppositeCasterID, command;
    var direction = null;
    var enabled = (content == top.document.commandDispatcher.focusedWindow);

    switch (casterPair) {
      case 'document':
        command = 'cmd_ltr_document';
        casterID = 'ltr-document-direction-broadcaster';
        oppositeCasterID = 'rtl-document-direction-broadcaster';
        direction = document.defaultView.getComputedStyle(document.getElementById('content-frame').contentDocument.body, "").getPropertyValue("direction");
        break;
      case 'paragraph':
        command = 'cmd_ltr_paragraph';
        casterID = 'ltr-paragraph-direction-broadcaster';
        oppositeCasterID = 'rtl-paragraph-direction-broadcaster';
        direction = GetCurrentSelectionDirection();
        break;
      default:
        return;
    }
    var caster = document.getElementById(casterID);
    var oppositeCaster = document.getElementById(oppositeCasterID);

    caster.setAttribute('checked', (direction == 'ltr') );
    caster.setAttribute('disabled', !enabled );
    oppositeCaster.setAttribute('checked', (direction == 'rtl') );
    oppositeCaster.setAttribute('disabled', !enabled );

  },

  setAllCasters: function() {
    this.setCasterGroup('document');
    this.setCasterGroup('paragraph');
  },

  doCommand: function(command) {
    switch (command) {
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
        dump("The command \"" + command + "\" isn't supported by the direction switch controller\n");
        return false;
    }
    this.setAllCasters();
  }
}

function CommandUpdate_MsgComposeDirection() {
  var focusedWindow = top.document.commandDispatcher.focusedWindow;
  // we're just setting focus to where it was before
  if (focusedWindow == gLastWindowToHaveFocus) {
    return;
  }
  gLastWindowToHaveFocus = focusedWindow;
  directionSwitchController.setAllCasters();
}
