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
 *   Ilya Konstantinov <mozilla-code@future.shiny.co.il>
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

#ifdef DEBUG
// The following 2 lines enable logging messages to the javascript console:
var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

// Here is an example of a console log message describing a DOM node:
// jsConsoleService.logStringMessage('visiting node: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\ninnerHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.outerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif

const nsISelectionController = Components.interfaces.nsISelectionController;

// Globals
var gLastWindowToHaveFocus; // used to prevent doing unncessary work when a focus
                            // 'changes' to the same window which is already in focus
var gAlternativeEnterBehavior;
                            // The default behavior of the Enter key in HTML mail messages
                            // is to insert a <br>; the alternative behavior we implement
                            // is to close a paragraph and begin a new one
var gParagraphVerticalMargin;
                            // Amount of space to add to paragraphs in HTML mail messages
var bidiKeyboardService = Components.classes['@mozilla.org/widget/bidikeyboard;1'].getService();
bidiKeyboardService.QueryInterface(Components.interfaces.nsIBidiKeyboard);
                            // Used for determining whether the current keyboard layout
                            // is RTL or LTR
gBodyReadyListener = {
  messageParams: null,

  NotifyComposeFieldsReady : function() { },
  ComposeProcessDone : function(result) { },
  SaveInFolderDone : function(folderName) { },
  NotifyComposeBodyReady : function() {
#ifdef DEBUG_gBodyReadyListener
    jsConsoleService.logStringMessage('body ready');
#endif
    if (this.messageParams.isReply) {
      performCorrectiveRecoding(
        document.getElementById("content-frame").contentDocument.body,
        this.messageParams.recodedCharset,
        this.messageParams.mailnewsDecodingType,
        (this.messageParams.recodedCharset != null),
        this.messageParams.recodedUTF8);
    }
    SetInitialDirection(this.messageParams);
  }
};


function KeyboardLayoutIsRTL()
{
    var obj = {};
    bidiKeyboardService.isLangRTL(obj);
    return obj.value;
}

function GetCurrentSelectionDirection()
{
#ifdef DEBUG_GetCurrentSelectionDirection
   jsConsoleService.logStringMessage('----- in GetCurrentSelectionDirection() -----');
#endif

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
  catch(ex) {
    // the editor is apparently unavailable... although it should be available!
    dump(ex);
    return null;
  }

  var view = document.defaultView;
  for (i=0; i < editor.selection.rangeCount; ++i ) {
    var range = editor.selection.getRangeAt(i);
    var node = range.startContainer;
    var cacIsLTR = false;
    var cacIsRTL = false;

    // first check the block level element which contains
    // the entire range (but don't use its direction just yet)

    cac = range.commonAncestorContainer;

    cbe = FindClosestBlockElement(cac);
    switch (view.getComputedStyle(cbe, "").getPropertyValue("direction")) {
      case "ltr":
        cacIsLTR = true;
        break;
      case "rtl":
        cacIsRTL = true;
        break;
    }

#ifdef DEBUG_GetCurrentSelectionDirection
    jsConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nHTML:\n" + cac.innerHTML);
    jsConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nvalue:\n" + cac.nodeValue + "\nis LTR = " + cacIsLTR + "; is RTL = " + cacIsRTL);
#endif

    if (cac.nodeType == Node.TEXT_NODE) {
      // the range is some text within a single DOM leaf node
      // so there's no need for any traversal
#ifdef DEBUG_GetCurrentSelectionDirection
      jsConsoleService.logStringMessage('just a text node, continuing');
#endif
      hasLTR = hasLTR || cacIsLTR;
      hasRTL = hasRTL || cacIsRTL;
      if (hasLTR && hasRTL)
        return "complex";
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
        return "complex";
      if (!cac.firstChild ) {
        // no cac descendents to traverse...
        continue;
      }
    }
    else {
      // check the start slope from the range start to the cac

      node = range.startContainer;
  
      while (node != cac) {
#ifdef DEBUG_GetCurrentSelectionDirection
        jsConsoleService.logStringMessage('visiting start slope node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif
        if (node.nodeType == Node.ELEMENT_NODE) {
          var nodeStyle = view.getComputedStyle(node, "");
          var display = nodeStyle.getPropertyValue("display");
          if (display == "block" || display == "table-cell" ||
              display == "table-caption" || display == "list-item" ||
              (node.nodeType == Node.DOCUMENT_NODE)) {
            switch (nodeStyle.getPropertyValue("direction")) {
              case "ltr":
                hasLTR = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                jsConsoleService.logStringMessage('found LTR');
#endif
                if (hasRTL)
                  return "complex";
                break;
              case "rtl":
                hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                jsConsoleService.logStringMessage('found RTL');
#endif
                if (hasLTR)
                  return "complex";
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
#ifdef DEBUG_GetCurrentSelectionDirection
      jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif

      // check the current node's direction

      // Note: a node of type TEXT_NODE will not be checked for direction,
      //       nor will it trigger the use of the cac's direction!

      if (node.nodeType == Node.ELEMENT_NODE) {
        var nodeStyle = view.getComputedStyle(node, "");
        var display = nodeStyle.getPropertyValue("display");
        if (display == "block" || display == "table-cell" ||
            display == "table-caption" || display == "list-item" ||
            (node.nodeType == Node.DOCUMENT_NODE)) {
          switch (nodeStyle.getPropertyValue("direction")) {
            case "ltr":
              hasLTR = true;
#ifdef DEBUG_GetCurrentSelectionDirection
              jsConsoleService.logStringMessage('found LTR');
#endif
              if (hasRTL)
                return "complex";
              break;
            case "rtl":
              hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
              jsConsoleService.logStringMessage('found RTL');
#endif
              if (hasLTR)
                return "complex";
              break;
          }
        }
        else if (node.parentNode == cac) {
          // there is a non-block child of cac, so we use cac's data
#ifdef DEBUG_GetCurrentSelectionDirection
          jsConsoleService.logStringMessage('non-block child of cac, using cac direction');
#endif
          hasLTR = hasLTR || cacIsLTR;
          hasRTL = hasRTL || cacIsRTL;
          if (hasLTR && hasRTL)
            return "complex";
        }
      }

      if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
        jsConsoleService.logStringMessage('at end container, stopping traversal');
#endif
        break; // proceed to the next selection range
      }

      // is there is a child node which need be traversed?

      if (node.firstChild) {
#ifdef DEBUG_GetCurrentSelectionDirection
        jsConsoleService.logStringMessage('descending to first child');
#endif
        node = node.firstChild;
        // fallthrough to sibling search in case first child is a text node
        if  (node.nodeType != Node.TEXT_NODE)
          continue; // we've found the next node to visit
        else if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
          jsConsoleService.logStringMessage('at TEXT_NODE endContainer, stopping traversal');        
#endif
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
#ifdef DEBUG_GetCurrentSelectionDirection
          jsConsoleService.logStringMessage('moving to next sibling');
#endif
          if  (node.nodeType != Node.TEXT_NODE)
            break; // we've found the next node to visit
          else continue; // try the next sibling
        }
        else node = node.parentNode;
#ifdef DEBUG_GetCurrentSelectionDirection
        jsConsoleService.logStringMessage('moving back up');
#endif
      } while (node != cac);

    } while (node != cac);

  } // end of the 'for' over the different selection ranges

  if (hasLTR && hasRTL)
    return "complex";

  if (hasRTL)
    return "rtl";
  if (hasLTR)
    return "ltr";

  return null;
}

function SetDocumentDirection(direction)
{
#ifdef DEBUG_SetDocumentDirection
  jsConsoleService.logStringMessage('--- SetDocumentDirection( \'' + direction + '\' ) ---');
#endif

  document.getElementById("content-frame").contentDocument.documentElement.style.direction = direction;
  document.getElementById("content-frame").contentDocument.body.style.direction = direction;
  // We can't use the dir attribute of the subject textbox, like we do for the
  // message body, since XUL elements' dir attribute means something else than
  // this attribute for HTML elements. But we can set it for its input field...
  document.getElementById("msgSubject").inputField.style.direction = direction;
}

function InsertControlCharacter(controlCharacter)
{
  editor = GetCurrentEditor();
  editor.beginTransaction();
  editor.insertText(controlCharacter);
  editor.endTransaction();
}

function SwitchDocumentDirection()
{
  var body = document.getElementById("content-frame").contentDocument.body;
  var currentDir = window.getComputedStyle(body, null).direction;

  if (currentDir == "rtl")
    directionSwitchController.doCommand("cmd_ltr_document");
  else
    directionSwitchController.doCommand("cmd_rtl_document");
}

function HandleComposeReplyCSS()
{
  if (IsHTMLEditor()) {
    var editor = GetCurrentEditor();
    if (!editor) {
      dump("Could not acquire editor object.");
      return;
    }
    editor.QueryInterface(nsIEditorStyleSheets);
    editor.addOverrideStyleSheet("chrome://bidimailpack/content/quotebar.css");
  }
}

function HandleDirectionButtons()
{
  var hiddenButtonsPref =
    !gBDMPrefs.getBoolPref("compose.show_direction_buttons", true);
  var isHTMLEditor = IsHTMLEditor();

#ifdef MOZ_THUNDERBIRD
   // Note: the main toolbar buttons are never hidden, since that toolbar
   //       is customizable in Thunderbird anyway
#else
   var hideMainToolbarButtons = hiddenButtonsPref || isHTMLEditor;

   document.getElementById("directionality-main-toolbar-section")
           .setAttribute("hidden", hideMainToolbarButtons);
   document.getElementById("directionality-separator-main-bar")
           .hidden = hideMainToolbarButtons;
#endif

  document.getElementById("directionality-formatting-toolbar-section")
          .setAttribute("hidden", hiddenButtonsPref);
  document.getElementById("directionality-separator-formatting-bar")
          .hidden = hiddenButtonsPref;
}

function LoadParagraphMode()
{
  // Get the desired space between the paragraphs we add
  // We use global variables in order to avoid different margins in the same document
  gParagraphVerticalMargin =
    GetParagraphMarginFromPref("compose.space_between_paragraphs");

  // our extension likes paragraph text entry, not 'body text' - since
  // paragraph are block elements, with a direction setting
  try {
    var editor = GetCurrentEditor();
    if (editor) {
      editor.setParagraphFormat("p");
      // as we don't use doStatefulCommand, we need to update the command
      // state attribute...
      document.getElementById("cmd_paragraphState").setAttribute("state", "p");
      var par = FindClosestBlockElement(editor.selection.focusNode);
      // Set "Space between paragraphs"
      par.style.marginBottom = gParagraphVerticalMargin;
      par.style.marginTop = 0;
    }
  } catch(ex) {
    // since the window is not 'ready', something might throw
    // an exception here, like inability to focus etc.
    dump(ex);
  }
}

function GetDisplayedCopyParams(messageURI,messageParams)
{
  // Note: there may be more than one window
  // which displays the message we are replying to;
  // since the enumeration is from the oldest window
  // to the newest, we'll overwrite the direction
  // setting if we find another window displaying the
  // same message; we will also overwrite the direction set
  // in a messenger window with a direction set in a
  // single message window

  var win, loadedMessageURI, displayedCopyBrowser;
  var windowManager = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                                .getService(nsIWindowMediator);
  var messengerWindowList = windowManager.getEnumerator("mail:3pane");
  var messageWindowList = windowManager.getEnumerator("mail:messageWindow");

  while (true) {
    if (messengerWindowList.hasMoreElements())
      win = messengerWindowList.getNext();
    else if (messageWindowList.hasMoreElements())
      win = messageWindowList.getNext();
    else
      break;

    loadedMessageURI = win.GetLoadedMessage();
    if (loadedMessageURI != messageURI)
      continue;

    displayedCopyBrowser = win.getMessageBrowser();
    if (!displayedCopyBrowser)
      continue;

    //messageContentElement =
    //  GetMessageContentElement(browser.docShell.contentViewer.DOMDocument);
    var displayedCopyBody = displayedCopyBrowser.contentDocument.body;
    for (var i=0; i < displayedCopyBody.childNodes.length; i++) {
      var subBody = displayedCopyBody.childNodes.item(i);
  
      if (! /^moz-text/.test(subBody.className))
        continue;
      messageParams.originalDisplayDirection = subBody.style.direction;
    }
    messageParams.recodedUTF8 = displayedCopyBody.hasAttribute('bidimailuiui-recoded-utf8');
    messageParams.recodedCharset = displayedCopyBody.getAttribute('bidimailuiui-recoded-charset');
    messageParams.mailnewsDecodingType = displayedCopyBody.getAttribute('bidimailuiui-detected-decoding-type');
  }
}

function DetermineNewMessageParams(messageBody,messageParams)
{
  try {
    messageParams.isReply = (gMsgCompose.originalMsgURI.length > 0);
  }
  catch(ex) {
    dump(ex);
  };

  if (messageParams.isReply) {
    // XXX TODO - this doesn't work for drafts;
    // they have no gMsgCompose.originalMsgURI
      GetDisplayedCopyParams(gMsgCompose.originalMsgURI,messageParams);
  }
}

function SetInitialDirection(messageParams)
{

  // determine whether we need to use the default direction;
  // this happens for new documents (e.g. new e-mail message,
  // or new composer page), and also for mail/news replies if the
  // prefs say we force the direction/ of replies to the default
  // direction for new messages
  if ( !messageParams.isReply ||
       gBDMPrefs.getBoolPref("compose.reply_in_default_direction", false)) {
    var defaultDirection =
      gBDMPrefs.getCharPref("compose.default_direction",
                             "ltr").toLowerCase();
    SetDocumentDirection(defaultDirection == "rtl" ? "rtl" : "ltr");
    return;
  }
  else if (messageParams.isReply && messageParams.originalDisplayDirection)
  {
    SetDocumentDirection(messageParams.originalDisplayDirection);
  }
  else {
#ifdef DEBUG_SetInitialDocumentDirection
    jsConsoleService.logStringMessage('shouldn\'t get here... probably no URI for this reply');
#endif
    // we shouldn't be able to get here - when replying, the original
    // window should be in existence
    // XXX TODO: but we do get here for drafts
    var detectionDirection = directionCheck(
      document.getElementById("content-frame").contentDocument.body);
    if ((detectionDirection  == "rtl") && (detectionDirection != "mixed"))
      SetDocumentDirection("rtl");
    else if (detectionDirection == "ltr")
      SetDocumentDirection("ltr");
  }
}

function ComposeWindowOnActualLoad()
{
  var messageBody =
    document.getElementById("content-frame").contentDocument.body;

#ifdef DEBUG_ComposeWindowOnActualLoad
  jsConsoleService.logStringMessage('--- ComposeWindowOnActualLoad() --- ');
#endif
  HandleDirectionButtons();
  // Track "Show Direction Buttons" pref.
  try {
    var pbi =
      gBDMPrefs.prefService
               .QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    pbi.addObserver(gDirectionButtonsPrefListener.domain,
                    gDirectionButtonsPrefListener, false);
  }
  catch(ex) {
    dump("Failed to observe prefs: " + ex + "\n");
  }

  HandleComposeReplyCSS();

  // When this message is already on display in the main Mail&News window
  // (or a separate message window) with its direction set to some value,
  // and perhaps with some content 'manually' recoded by our extension
  // we wish to maintain the same direction and perform the same recoding
  // when bringing up the message in an editor window. Such is the case
  // for drafts and for replies; for new (empty) messages, we use a default
  // direction

  var messageParams = {
    isReply: false,
    originalDisplayDirection: null,
    recodedUTF8: true,
    recodedCharset: null,
    mailnewsDecodingType : 'latin-charset'
  };
    
  DetermineNewMessageParams(messageBody,messageParams);
#ifdef DEBUG_ComposeWindowOnActualLoad
  jsConsoleService.logStringMessage('isReply = ' + messageParams.isReply + 
    '\ngMsgCompose.originalMsgURI = ' +
    (gMsgCompose? gMsgCompose.originalMsgURI : 'no gMsgCompose') +
    '\noriginalDisplayDirection = ' + messageParams.originalDisplayDirection + 
    '\nUTF-8 recoded = ' + messageParams.recodedUTF8 +
    '\ncharset recoded = ' + messageParams.recodedCharset +
    '\nmailnews decoding type = ' + messageParams.mailnewsDecodingType );
#endif

  var isHTMLEditor = IsHTMLEditor();

  // Decide which direction switch item should appear in the context menu -
  // the switch for the whole document or for the current paragraph
  document.getElementById("contextSwitchParagraphDirectionItem")
          .hidden = !isHTMLEditor;
  document.getElementById("contextBodyDirectionItem")
          .hidden = isHTMLEditor;

  if (isHTMLEditor) {
    // Determine Enter key behavior
    gAlternativeEnterBehavior =
      gBDMPrefs.getBoolPref("compose.alternative_enter_behavior", true);
    if (gAlternativeEnterBehavior)
      LoadParagraphMode();
  }

  if (messageParams.isReply) {
    if (!gUnicodeConverter)
      gUnicodeConverter =
        Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
                  .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
  }                
  gBodyReadyListener.messageParams = messageParams;
  gMsgCompose.RegisterStateListener(gBodyReadyListener);
  directionSwitchController.setAllCasters();
}

function ComposeWindowOnUnload()
{
  // Stop tracking "Show Direction Buttons" pref.
  try {
    var pbi =
      gBDMPrefs.prefService
               .QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    pbi.removeObserver(gDirectionButtonsPrefListener.domain,
                       gDirectionButtonsPrefListener);
  }
  catch(ex) {
    dump("Failed to remove pref observer: " + ex + "\n");
  }
}

function ComposeWindowOnLoad()
{
  gLastWindowToHaveFocus = null;
  
  if (gMsgCompose) {
    ComposeWindowOnActualLoad();
    document.removeEventListener("load", ComposeWindowOnLoad, true);
  }
  else {
    dump("gMsgCompose not ready for this message in ComposeWindowOnLoad");
  }
}

function ComposeWindowOnReopen()
{
  gLastWindowToHaveFocus = null;
  
  if (gMsgCompose) {
    // technically this could be a second call to ComposeWindowOnActualLoad(),
    // which should only be run once, but what's happening is that the message
    // window created initially and never visible, with ComposeWindowOnActualLoad()
    // having already run once, is being replicated for use with a (possibly)
    // different message 
    ComposeWindowOnActualLoad();
    document.removeEventListener("compose-window-reopen", ComposeWindowOnLoad, true);
    document.removeEventListener("load", ComposeWindowOnReopen, true);
  }
  else {
    dump("gMsgCompose not ready for this message in ComposeWindowOnReopen()");
  }
}

#ifdef DEBUG_ComposeEvents
var gLoadCount = 0;
var gReopenCount = 0;

function DebugLoadHandler(ev)
{
  gLoadCount++;
  jsConsoleService.logStringMessage('load event #' + gLoadCount + ' :\ncurrentTarget = ' + ev.currentTarget + ' ; originalTarget = ' + ev.originalTarget + ' ; explicitOriginalTarget = ' + ev.explicitOriginalTarget);
}

function DebugLoadHandlerNonCapturing()
{
  jsConsoleService.logStringMessage('this is a non-capturing load event');
}

function DebugReopenHandler(ev)
{
  gReopenCount++;
  jsConsoleService.logStringMessage('compose-window-reopen event #' + gReopenCount + ' :\ncurrentTarget = ' + ev.currentTarget + ' ; originalTarget = ' + ev.originalTarget + ' ; explicitOriginalTarget = ' + ev.explicitOriginalTarget);
}
function DebugReopenHandlerNonCapturing()
{
  jsConsoleService.logStringMessage('this is a non-capturing compose-window-reopen event');
}

#endif

function InstallComposeWindowEventHandlers()
{
  top.controllers.appendController(directionSwitchController);
#ifdef DEBUG_ComposeEvents
  window.addEventListener("load", DebugLoadHandler, true);
  window.addEventListener("compose-window-reopen",
                            DebugReopenHandler, true);
  window.addEventListener("load", DebugLoadHandlerNonCapturing, false);
  window.addEventListener("compose-window-reopen",
                            DebugReopenHandlerNonCapturing, false);
#endif
  window.addEventListener("load", ComposeWindowOnLoad, false);
  window.addEventListener("compose-window-reopen",
                            ComposeWindowOnReopen, true);
  window.addEventListener("unload", ComposeWindowOnUnload, true);
  window.addEventListener("keypress", onKeyPress, true);
}

function FindClosestBlockElement(node)
{
  // Try to locate the closest ancestor with display:block
  var v = node.ownerDocument.defaultView;
  while (node) {
    if (node.nodeType == node.ELEMENT_NODE) {
      var display = v.getComputedStyle(node, "").getPropertyValue("display");
      if (display == "block" || display == "table-cell" || 
          display == "table-caption" || display == "list-item")
        return node;
    }
    node = node.parentNode;
  }
  return node;
}

function ApplyToSelectionBlockElements(evalStr)
{
#ifdef DEBUG_ApplyToSelectionBlockElements
  jsConsoleService.logStringMessage('----- ApplyToSelectionBlockElements() -----');
#endif
  var editor = GetCurrentEditor();
  if (!editor) {
    dump("Could not acquire editor object.");
    return;
  }

  if (editor.selection.rangeCount > 0) {
    editor.beginTransaction();
    try {
      for (i=0; i < editor.selection.rangeCount; ++i) {
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
        
#ifdef DEBUG_ApplyToSelectionBlockElements
        jsConsoleService.logStringMessage('endContainer:' + endContainer + "\ntype: " + endContainer.nodeType + "\nHTML:\n" + endContainer.innerHTML + "\nvalue:\n" + endContainer.nodeValue);
#endif

        var node = startContainer;
        // walk the tree till we find the endContainer of the selection range,
        // giving our directionality style to everything on our way
        do {
#ifdef DEBUG_ApplyToSelectionBlockElements
          jsConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif

          var closestBlockElement = FindClosestBlockElement(node);
          if (closestBlockElement) {
#ifdef DEBUG_ApplyToSelectionBlockElements
            jsConsoleService.logStringMessage('found closestBlockElement:' + closestBlockElement + "\ntype: " + closestBlockElement.nodeType + "\nHTML:\n" + closestBlockElement.innerHTML + "\nvalue:\n" + closestBlockElement.nodeValue);
#endif
            eval(evalStr);
          }
          else {
#ifdef DEBUG_ApplyToSelectionBlockElements
            jsConsoleService.logStringMessage('could not find cbe');
#endif
            break;
          }

          // This check should be placed here, not as the 'while'
          // condition, to handle cases where begin == end
          if (node == endContainer) {
#ifdef DEBUG_ApplyToSelectionBlockElements
            jsConsoleService.logStringMessage('at end container, stopping traversal');
#endif
            break;
          }

          // Traverse through the tree in order
          if (node.firstChild) {
#ifdef DEBUG_ApplyToSelectionBlockElements
            jsConsoleService.logStringMessage('descending to first child');
#endif
            node = node.firstChild;
          }
          else if (node.nextSibling) {
#ifdef DEBUG_ApplyToSelectionBlockElements
            jsConsoleService.logStringMessage('moving to next sibling');
#endif
            node = node.nextSibling;
          }
          else
            // find a parent node which has anything after
            while (node = node.parentNode) {
#ifdef DEBUG_ApplyToSelectionBlockElements
              jsConsoleService.logStringMessage('moved up to parent node');
#endif
              if (node.nextSibling) {
                node = node.nextSibling;
#ifdef DEBUG_ApplyToSelectionBlockElements
                jsConsoleService.logStringMessage('moved to next sibling');
#endif
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
    'var dir = (closestBlockElement.ownerDocument.defaultView' +
                                   '.getComputedStyle(closestBlockElement, "")' +
                                   '.getPropertyValue("direction") == "rtl"? "ltr" : "rtl");' +
    'editor.setAttribute(closestBlockElement, "dir", dir);';
  ApplyToSelectionBlockElements(evalStr);
}

function onKeyPress(ev)
{
  if (!gAlternativeEnterBehavior ||  // preffed off
      // text-plain message
      !IsHTMLEditor() ||
      // The editor element isn't focused
      top.document.commandDispatcher.focusedWindow != content ||
      // The preventDefault flag is set on the event
      // (see http://bugzilla.mozdev.org/show_bug.cgi?id=12748)
      ev.getPreventDefault())
    return;

  var editor = GetCurrentEditor();

  // Steal all plain enters without modifiers (e.g. do not change
  // behaivor of Shift+Enter which inserts a <br>, Ctrl+Enter which
  // sends the message etc.)
  if ((ev.keyCode == KeyEvent.DOM_VK_ENTER || ev.keyCode == KeyEvent.DOM_VK_RETURN) &&
      !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey &&
      !isInList()) {
    // but don't do this if we're not in paragraph mode...
    // (getParagraphState returns the paragraph state for the selection.)
    editor = GetCurrentEditor();
    var isParMixed = { value: false }; // would be ignored
    var parState = editor.getParagraphState(isParMixed);

    // we currently apply our own enter behavior to
    // paragraph states "p" and "h1" through "h6"

    if (parState != "p" &&
        parState.length != 2 )
      return;

    // Do whatever it takes to prevent the editor from inserting a BR
    ev.preventDefault();
    ev.stopPropagation();

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
      var par = FindClosestBlockElement(editor.selection.focusNode);
      var prevPar = par.previousSibling;
      if (par && prevPar &&
          prevPar.tagName.toLowerCase() == "p" &&
          par.tagName.toLowerCase() == "p" &&
          isFirstTextNode(par, editor.selection.focusNode, false) &&
          editor.selection.focusOffset == 0) {

        // combine the two paragraphs into a single paragraph
#ifdef DEBUG_keypress
        var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
        jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

        jsConsoleService.logStringMessage('unifying paragraphs\n------------------------');
        jsConsoleService.logStringMessage('prevPar is:' + prevPar + "\ntype: " + prevPar.nodeType + "\nname: " + prevPar.nodeName + "\nHTML:\n" + prevPar.innerHTML + "\nOuter HTML:\n" + prevPar.innerHTML + "\nvalue:\n" + prevPar.nodeValue);
        jsConsoleService.logStringMessage('par is:' + par + "\ntype: " + par.nodeType + "\nname: " + par.nodeName + "\nHTML:\n" + par.innerHTML + "\nOuter HTML:\n" + par.innerHTML + "\nvalue:\n" + par.nodeValue);
#endif
        editor.beginTransaction();
 
        var newPar = prevPar.cloneNode(true);
        var pChild = par.firstChild;
  
        // if nextPar is an 'empty' par in the sense of only having a <br> (editor idiosyncracy),
        // we won't add the extra <br>
        if (par.childNodes.length == 1 && pChild.nodeName == "BR") {
#ifdef DEBUG_keypress
          jsConsoleService.logStringMessage('just removing an empty paragraph');
#endif
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
#ifdef DEBUG_keypress
            jsConsoleService.logStringMessage('copying pcClone:' + pcClone + "\ntype: " + pcClone.nodeType + "\nname: " + pcClone.nodeName + "\nHTML:\n" + pcClone.innerHTML + "\nOuter HTML:\n" + pcClone.innerHTML + "\nvalue:\n" + pcClone.nodeValue);
#endif
            newPar.appendChild(pc2);
          }
          prevPar.parentNode.removeChild(par);
          prevPar.parentNode.replaceChild(newPar,prevPar);
          editor.selection.collapse(newPar, nc);
        }
        editor.endTransaction();
#ifdef DEBUG_keypress
        jsConsoleService.logStringMessage('done');
#endif
        ev.preventDefault();
        ev.stopPropagation();
      }
    }  
  }
}

/* Comment Me! */
function isFirstTextNode(blockElement, node, found)
{
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

function GetParagraphMarginFromPref(basePrefName)
{
  var marginScale = gBDMPrefs.getCharPref(basePrefName + ".scale", "cm");
  var marginVal;
  if (marginScale != "px") {
    marginVal =
      parseFloat(gBDMPrefs.getCharPref(basePrefName + ".value", "0"), 10);
  }
  else {
    marginVal =
      parseInt(gBDMPrefs.getCharPref(basePrefName + ".value", "0"), 10);
  }
  if (isNaN(marginVal))
    marginVal = "0";

  return (marginVal + marginScale);
}

// This function attempts to break off the remainder of the current
// line into a new paragraph; it assumes we are not within a list

function InsertParagraph()
{
  var editor = GetCurrentEditor();
  if (!editor) {
    dump("Could not acquire editor object.");
    return;
  }

  editor.beginTransaction();

  if (!editor.selection.isCollapsed)
    editor.deleteSelection(editor.eNone);

  editor.insertLineBreak();

  // -- Remember the old style rules before we move into paragraph mode --

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
    styleFontSize = document.defaultView
                            .getComputedStyle(editor.getSelectionContainer(), "")
                            .getPropertyValue("font-size");
    var elt = FindClosestBlockElement(editor.getSelectionContainer());
    isStyleFontSize.value = (styleFontSize != document.defaultView
                                                      .getComputedStyle(elt, "")
                                                      .getPropertyValue("font-size"));
  }
  catch(ex) { }
  // -- "Remember old style"

  editor.setParagraphFormat("p");
  var par = FindClosestBlockElement(editor.selection.focusNode);
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
  if (node && node.nodeType == node.ELEMENT_NODE &&
      node.tagName.toLowerCase() == "br") {
    var isFirstNode = false;
    var firstNode = prevPar.firstChild;
    while (firstNode) {
      if (firstNode == node) {
        isFirstNode = true;
        break;
      }
      firstNode = firstNode.firstChild;
    }
    if (!isFirstNode)
      editor.deleteNode(node);
  }

  // Set "Space between paragraphs"
  par.style.marginBottom = gParagraphVerticalMargin;
  par.style.marginTop = 0;

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
  if (prevPar.hasAttribute("dir"))
    editor.setAttribute(par, "dir", prevPar.getAttribute("dir"));
  // ------------------------------- "set old style" ------

  // Make sure the line in which the caret is in is visible
  try {
    var selCon = editor.selectionController;
    if (selCon) {
      selCon.scrollSelectionIntoView(
        nsISelectionController.SELECTION_NORMAL,
        nsISelectionController.SELECTION_FOCUS_REGION,
        true);
    }
  }
  catch(ex) {
    dump(ex);
  }
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
    var inMessage = (content == top.document.commandDispatcher.focusedWindow);
    var inSubjectBox = 
      (document.commandDispatcher.focusedElement ==
       document.getElementById("msgSubject").inputField);
    var retVal = false;
    
    // and now for what this function is actually supposed to do...

    // due to the ridiculous design of the controller interface,
    // the isCommandEnabled function has side-effects! and we
    // must use it to update button states because no other
    // method gets called to do that

    switch (command) {
      case "cmd_switch_paragraph":
      case "cmd_clear_paragraph_dir":
        retVal = inMessage;
        break;
      case "cmd_switch_document":
        retVal = inMessage || inSubjectBox;
        break;

      case "cmd_ltr_document":
        this.setCasterGroup("document");
      case "cmd_rtl_document":
        retVal = inMessage || inSubjectBox;
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_document
        break;
      
      case "cmd_ltr_paragraph":
        if (IsHTMLEditor())
          this.setCasterGroup("paragraph");
      case "cmd_rtl_paragraph":
        retVal = inMessage;
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_paragraph
        break;
    }

    return retVal;
  },

  setCasterGroup: function(casterPair) {
    var casterID, oppositeCasterID, command, direction, commandsAreEnabled;
    var inMessage = (content == top.document.commandDispatcher.focusedWindow);

    // window is not ready to run getComputedStyle before some point,
    // and it would cause a crash if we were to continue (see bug 11712)
    if (!gMsgCompose)
      return;

    switch (casterPair) {
      case "document":
        command = "cmd_ltr_document";
        casterID = "ltr-document-direction-broadcaster";
        oppositeCasterID = "rtl-document-direction-broadcaster";

        direction =
          document.defaultView
                  .getComputedStyle(document.getElementById("content-frame")
                  .contentDocument.body, "").getPropertyValue("direction");
        var inSubjectBox =
          (document.commandDispatcher.focusedElement ==
           document.getElementById("msgSubject").inputField);
        commandsAreEnabled = inMessage || inSubjectBox;
        break;
      case "paragraph":
        command = "cmd_ltr_paragraph";
        casterID = "ltr-paragraph-direction-broadcaster";
        oppositeCasterID = "rtl-paragraph-direction-broadcaster";

        direction = GetCurrentSelectionDirection();

        var isRTL = (direction == "rtl");
        document.getElementById("ulButton").setAttribute("rtlmode", isRTL);
        document.getElementById("olButton").setAttribute("rtlmode", isRTL);
        document.getElementById("outdentButton").setAttribute("rtlmode", isRTL);
        document.getElementById("indentButton").setAttribute("rtlmode", isRTL);
        commandsAreEnabled = inMessage;
        break;
      default:
        var isRTL = document.getElementById("rtl-paragraph-direction-broadcaster").getAttribute("checked");
        document.getElementById("ulButton").setAttribute("rtlmode", isRTL);
        document.getElementById("olButton").setAttribute("rtlmode", isRTL);
        document.getElementById("outdentButton").setAttribute("rtlmode", isRTL);
        document.getElementById("indentButton").setAttribute("rtlmode", isRTL);

        return;
    }
    var caster = document.getElementById(casterID);
    var oppositeCaster = document.getElementById(oppositeCasterID);

    caster.setAttribute("checked", direction == "ltr");
    caster.setAttribute("disabled", !commandsAreEnabled);
    oppositeCaster.setAttribute("checked", direction == "rtl");
    oppositeCaster.setAttribute("disabled", !commandsAreEnabled);
  },

  setAllCasters: function() {
    this.setCasterGroup("document");
    this.setCasterGroup("paragraph");
  },

  doCommand: function(command) {
    switch (command) {
      case "cmd_rtl_paragraph":
        SetParagraphDirection("rtl");
        break;
      case "cmd_ltr_paragraph":
        SetParagraphDirection("ltr");
        break;
      case "cmd_rtl_document":
        SetDocumentDirection("rtl");
        break;
      case "cmd_ltr_document":
        SetDocumentDirection("ltr");
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
        dump("The command \"" + command +
             "\" isn't supported by the direction switch controller\n");
        return false;
    }
    this.setAllCasters();
  }
}

function CommandUpdate_MsgComposeDirection()
{
  var focusedWindow = top.document.commandDispatcher.focusedWindow;

  // we're just setting focus to where it was before
  if (focusedWindow == gLastWindowToHaveFocus)
    return;

  gLastWindowToHaveFocus = focusedWindow;
  directionSwitchController.setAllCasters();
}

const gDirectionButtonsPrefListener =
{
  domain: "bidiui.mail.compose.show_direction_buttons",
  observe: function(subject, topic, prefName) {
    if (topic != "nsPref:changed")
      return;

    HandleDirectionButtons();
  }
};