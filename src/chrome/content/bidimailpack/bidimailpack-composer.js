var moduleURI = "chrome://bidimailpack/content/bidimailpack-common.js";
if (typeof(ChromeUtils) != "undefined") {
  if (ChromeUtils.import) {
    var { BiDiMailUI } = ChromeUtils.import(moduleURI);
  }
  else { Components.utils.import(moduleURI);}
}
else { Components.utils.import(moduleURI); }

BiDiMailUI.Composition = {

  lastWindowToHaveFocus : null,
    // used to prevent doing unncessary work when a focus
    // 'changes' to the same window which is already in focus
  alternativeEnterBehavior : null,
    // The default behavior of the Enter key in HTML mail messages
    // is to insert a <br>; the alternative behavior we implement
    // is to close a paragraph and begin a new one (assuming we're
    // in Paragraph Mode)

  CtrlShiftMachine : {
    // We have implemented a Mealy automaton for implementing the Ctrl+Shift
    // detection hack; see bug 15075. The automaton has as input the sequence of
    // keyboard events; let their alphabet be pairs of the form xy, where x is one
    // of the three types of events - keypress (P), keyup(U) and keydown (D) - and
    // y is a keycode - Ctrl, Shift or any other keycode (C, S and O respectively).
    // The automaton tests for the following regular expression :
    //
    // DC DS (PC + PS + DC + DS )*  (UC + US)
    //
    // and switches the direction whenever it matches this sequence. The automaton
    // implementation (appearing in the keyboard event handler functions) requires 
    // two bits for state memory:

    ctrlShiftSequence1 : null,
    ctrlShiftSequence2 : null,

    CtrlKeyCode : 17,
    ShiftKeyCode : 16,
  },

  bodyReadyListener : {
    messageParams: null,
    workaroundForcingTimeoutId : null,

    NotifyComposeFieldsReady : function() { },
    ComposeProcessDone : function(result) { },
    SaveInFolderDone : function(folderName) { },
    NotifyComposeBodyReady : function() {

#ifdef DEBUG_bodyReadyListener
      BiDiMailUI.JSConsoleService.logStringMessage('in BiDiMailUI.Composition.bodyReadyListener.NotifyComposeBodyReady');
#endif

      var cMCParams = {
        body: document.getElementById("content-frame").contentDocument.body,
        charsetOverrideInEffect: true,
          // it seems we can't trigger a reload by changing the charset
          // during composition, the change only affects how the message
          // is encoded eventually based on what we already have in the 
          // window
        currentCharset: gMsgCompose.compFields.characterSet,
        messageHeader:
          (this.messageParams.isReply ? 
          gMsgCompose.originalMsgURI : null),
        messageSubject: 
          document.getElementById("msgSubject").value,
        subjectSetter: function(str) {
            document.getElementById("msgSubject").value = str;
          },
        unusableCharsetHandler : function() { return null; },
          //
        needCharsetForcing: false,
          // this is an out parameter, irrelevant in our case
        charsetToForce: null,
          // this is an out parameter, irrelevant in our case
      }
      
      // Note: we can't base ourselves on the way the charset
      // was handled in the original message, since the option
      // of reloading with a different charset is unavailable.
      
      if (!this.messageParams.isReply ||
          !this.messageParams.gotDisplayedCopyParams ||
          this.messageParams.charsetWasForced ||
          this.messageParams.correctiveRecodedUTF8 ||
          this.messageParams.correctiveRecodedCharset) {
        BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection(cMCParams);
      }
#ifdef DEBUG_GetCurrentSelectionDirection
      else {
        BiDiMailUI.JSConsoleService.logStringMessage(
          'original message is known to have had no charset issues;' +
          'avoiding charsetMisdetectionCorrection');
      }
#endif

      if (IsHTMLEditor()) {
        var defaultToSendBothTextAndHTML =
          BiDiMailUI.Prefs.getBoolPref("compose.default_to_send_text_with_html", false);
        
        var defaultOptionElementId = 
          (defaultToSendBothTextAndHTML ? "format_both" : "format_html");
        document.getElementById(defaultOptionElementId)
                .setAttribute("checked", "true");
        OutputFormatMenuSelect(
          {getAttribute: function () {
            return defaultOptionElementId;
          }} );

        BiDiMailUI.Composition.setParagraphMarginsRule();
        // note that the "alternative Enter key behavior" is only
        // relevant to paragraph mode; we used to always try to set
        // paragraph mode to express that behavior, but several users
        // have been complaining...
        var startCompositionInParagraphMode =
          BiDiMailUI.Prefs.getBoolPref("compose.start_composition_in_paragraph_mode", false);
        if (startCompositionInParagraphMode)
          BiDiMailUI.Composition.setParagraphMode("p");
        else 
          BiDiMailUI.Composition.setParagraphMode("");
      }

      BiDiMailUI.Composition.setInitialDirection(this.messageParams);
      clearTimeout(this.workaroundForcingTimeoutId);
    }
  },

  getCurrentSelectionDirection : function() {
#ifdef DEBUG_GetCurrentSelectionDirection
     BiDiMailUI.JSConsoleService.logStringMessage(
       '----- in GetCurrentSelectionDirection() -----');
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
      // the editor is apparently unavailable... 
      // although it should be available!
      dump(ex);
      return null;
    }

    var view = document.defaultView;
    for (let i=0; i < editor.selection.rangeCount; ++i ) {
      var range = editor.selection.getRangeAt(i);
      var node = range.startContainer;
      var cacIsLTR = false;
      var cacIsRTL = false;

      // first check the block level element which contains
      // the entire range (but don't use its direction just yet)

      var cac = range.commonAncestorContainer;

      var cbe = BiDiMailUI.Composition.findClosestBlockElement(cac);
      switch (view.getComputedStyle(cbe, "").getPropertyValue("direction")) {
        case "ltr":
          cacIsLTR = true;
          break;
        case "rtl":
          cacIsRTL = true;
        break;
      }

#ifdef DEBUG_GetCurrentSelectionDirection
      BiDiMailUI.JSConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nHTML:\n" + cac.innerHTML);
      BiDiMailUI.JSConsoleService.logStringMessage('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nvalue:\n" + cac.nodeValue + "\nis LTR = " + cacIsLTR + "; is RTL = " + cacIsRTL);
#endif

      if (cac.nodeType == Node.TEXT_NODE) {
        // the range is some text within a single DOM leaf node
        // so there's no need for any traversal
#ifdef DEBUG_GetCurrentSelectionDirection
        BiDiMailUI.JSConsoleService.logStringMessage('just a text node, continuing');
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

        if ( cac.nodeName != "BODY" || !cac.firstChild ) {
          // if the body has no children, only its direction counts...
          hasLTR = hasLTR || cacIsLTR;
          hasRTL = hasRTL || cacIsRTL;
        }
        if (hasLTR && hasRTL)
          return "complex";
        if (!cac.firstChild ) {
          // no cac descendents to traverse...
          continue; // to next selection range
        }
      }
      else {
        // check the start slope from the range start to the cac

        node = range.startContainer;

        while ( (typeof(node) !== "undefined") && (node != cac) ) {
#ifdef DEBUG_GetCurrentSelectionDirection
          BiDiMailUI.JSConsoleService.logStringMessage('visiting start slope node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif
          if ( (typeof(node) !== "undefined") && node.nodeType == Node.ELEMENT_NODE) {
            var nodeStyle = view.getComputedStyle(node, "");
            var display = nodeStyle.getPropertyValue("display");
            if (display == "block" || display == "table-cell" ||
                display == "table-caption" || display == "list-item" ||
                (node.nodeType == Node.DOCUMENT_NODE)) {
              switch (nodeStyle.getPropertyValue("direction")) {
                case "ltr":
                  hasLTR = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                  BiDiMailUI.JSConsoleService.logStringMessage('found LTR');
#endif
                  if (hasRTL)
                    return "complex";
                break;
              case "rtl":
                hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                BiDiMailUI.JSConsoleService.logStringMessage('found RTL');
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
        BiDiMailUI.JSConsoleService.logStringMessage('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
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
                BiDiMailUI.JSConsoleService.logStringMessage('found LTR');
#endif
                if (hasRTL)
                  return "complex";
                break;
              case "rtl":
                hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                BiDiMailUI.JSConsoleService.logStringMessage('found RTL');
#endif
                if (hasLTR)
                  return "complex";
                break;
            }
          }
          else if (node.parentNode == cac) {
      // there is a non-block child of cac, so we use cac's data
#ifdef DEBUG_GetCurrentSelectionDirection
            BiDiMailUI.JSConsoleService.logStringMessage('non-block child of cac, using cac direction');
#endif
            hasLTR = hasLTR || cacIsLTR;
            hasRTL = hasRTL || cacIsRTL;
            if (hasLTR && hasRTL)
              return "complex";
          }
        }

        if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
          BiDiMailUI.JSConsoleService.logStringMessage('at end container, stopping traversal');
#endif
          break; // proceed to the next selection range
        }

        // is there is a child node which need be traversed?

        if (node.firstChild) {
#ifdef DEBUG_GetCurrentSelectionDirection
          BiDiMailUI.JSConsoleService.logStringMessage('descending to first child');
#endif
          node = node.firstChild;
        // fallthrough to sibling search in case first child is a text node
          if  (node.nodeType != Node.TEXT_NODE)
            continue; // we've found the next node to visit
          else if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
            BiDiMailUI.JSConsoleService.logStringMessage('at TEXT_NODE endContainer, stopping traversal');        
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
            BiDiMailUI.JSConsoleService.logStringMessage('moving to next sibling');
#endif
            if  (node.nodeType != Node.TEXT_NODE)
              break; // we've found the next node to visit
            else continue; // try the next sibling
          }
          else node = node.parentNode;
#ifdef DEBUG_GetCurrentSelectionDirection
          BiDiMailUI.JSConsoleService.logStringMessage('moving back up');
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
  },

  setDocumentDirection : function(direction) {
#ifdef DEBUG_SetDocumentDirection
    BiDiMailUI.JSConsoleService.logStringMessage('--- SetDocumentDirection( \'' + direction + '\' ) ---');
#endif

    let contentFrame = document.getElementById("content-frame");
    if (contentFrame) {
      document.getElementById("content-frame").contentDocument.documentElement.style.direction = direction;
      document.getElementById("content-frame").contentDocument.body.style.direction = direction;
    }
#ifdef DEBUG_SetDocumentDirection
    else {
      BiDiMailUI.JSConsoleService.logStringMessage(
         'could not get the "content-frame" by ID - that shouldn\'t be possible');
    }
#endif
    // We can't use the dir attribute of the subject textbox / html:input, like we 
    // do for the message body, since XUL elements' dir attribute means something 
    // else than this attribute for HTML elements. But we can set it for its input 
    // field...
    document.getElementById("msgSubject").inputField.style.direction = direction;
    BiDiMailUI.Prefs.setCharPref("compose.last_used_direction", direction);
  },

  // This inserts any character, actually
  insertControlCharacter : function(controlCharacter) {
    editor = GetCurrentEditor();
    editor.beginTransaction();
    editor.insertText(controlCharacter);
    editor.endTransaction();
  },

  switchDocumentDirection : function() {
    var body = document.getElementById("content-frame").contentDocument.body;
    var currentDir = window.getComputedStyle(body, null).direction;

    // Note: Null/empty value means LTR, so we check for RTL only

    if (currentDir == "rtl")
      BiDiMailUI.Composition.directionSwitchController.doCommand("cmd_ltr_document");
    else
      BiDiMailUI.Composition.directionSwitchController.doCommand("cmd_rtl_document");
  },

  handleComposeReplyCSS : function() {
    if (IsHTMLEditor()) {
      var editor = GetCurrentEditor();
      if (!editor) {
#ifdef DEBUG_handleComposeReplyCSS
        BiDiMailUI.JSConsoleService.logStringMessage('handleComposeReplyCSS failed to acquire editor object.');
#endif
        dump('handleComposeReplyCSS failed to acquire editor object.');
        return;
      }
      editor.QueryInterface(nsIEditorStyleSheets);
      editor.addOverrideStyleSheet("chrome://bidimailpack/content/quotebar.css");
    }
  },

  getMessageHead : function() {
    // assuming the head is the edited document element's first child
    return document.getElementById("content-frame")
      .contentDocument.documentElement.firstChild;
  },
  
  addMessageStyleRules : function(styleRulesText) {
    var editor = GetCurrentEditor();
    if (!editor) {
#ifdef DEBUG_addMessageStyleRules
      BiDiMailUI.JSConsoleService.logStringMessage('addMessageStyleRules failed to acquire editor object.');
#endif
      dump('addMessageStyleRules failed to acquire editor object.');
      return;
    }

    editor.beginTransaction();

    var css = 
      document.getElementById("content-frame").contentDocument.createElement('style');
    css.type = 'text/css';
    if (css.styleSheet) {
      css.styleSheet.cssText = styleRulesText;
    }
    else {
      css.appendChild(document.createTextNode(styleRulesText));
    }
    BiDiMailUI.Composition.getMessageHead().appendChild(css);  
    editor.endTransaction();
  },

  handleDirectionButtons : function() {
    var hiddenButtonsPref =
      !BiDiMailUI.Prefs.getBoolPref("compose.show_direction_buttons", true);
    var isHTMLEditor = IsHTMLEditor();

#ifdef MOZ_SUITE_LEGACY
     var hideMainToolbarButtons = hiddenButtonsPref || isHTMLEditor;

     document.getElementById("directionality-main-toolbar-section")
       .setAttribute("hidden", hideMainToolbarButtons);
     document.getElementById("directionality-separator-main-bar")
       .hidden = hideMainToolbarButtons;

#endif
    // Note: In Thunderbird and Seamonkey 2.x, the main toolbar buttons are
    // never hidden, since that toolbar is customizable

    document.getElementById("directionality-formatting-toolbar-section")
      .setAttribute("hidden", hiddenButtonsPref);
    document.getElementById("directionality-separator-formatting-bar")
      .hidden = hiddenButtonsPref;
  },

  setParagraphMarginsRule : function() {
    // add a style rule to the document with the paragraph
    // vertical margins dictated by the prefs
    
    var margin =
      BiDiMailUI.Composition.getParagraphMarginFromPrefs();
    BiDiMailUI.Composition.addMessageStyleRules(
      "body p { margin-bottom: " + margin + "; margin-top: 0pt; } ");
  },

  // Our extension likes "Paragraph Mode" rather than "Body Text" mode
  // for composing messages - since paragraph are block elements, with
  // a direction setting; this function can set the mode either way,
  // using "p" or "" (for paragraph and body respectively)

  setParagraphMode : function(modeStr) {
    var editor = GetCurrentEditor();
    if (!editor) {
#ifdef DEBUG_handleComposeReplyCSS
      BiDiMailUI.JSConsoleService.logStringMessage('setParagraphMode  failed to acquire editor object.');
#endif
      dump('setParagraphMode failed to acquire editor object.');
      return;
    }
    editor.setParagraphFormat(modeStr);
    // as we don't use doStatefulCommand, we need to update the command
    // state attribute...
    document.getElementById("cmd_paragraphState").setAttribute("state", modeStr);
  },

  getDisplayedCopyParams : function(messageURI,messageParams) {
#ifdef DEBUG_getDisplayedCopyParams
      BiDiMailUI.JSConsoleService.logStringMessage('getDisplayedCopyParams for message\n' + messageURI);
#endif
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
          .getService(Components.interfaces.nsIWindowMediator);
    var messengerWindowList = windowManager.getEnumerator("mail:3pane");
    var messageWindowList = windowManager.getEnumerator("mail:messageWindow");
    var tabInfo,tabIndex;

    while (true) {
#ifdef DEBUG_getDisplayedCopyParams
      BiDiMailUI.JSConsoleService.logStringMessage('loop iteration');
#endif

      // get the next browser for a loaded message

      if (tabInfo) {
        // we've gotten that tab info for some window and are
        // traversing all tabs      
        if (tabIndex == tabInfo.length) {
          tabInfo = null;
#ifdef DEBUG_getDisplayedCopyParams
           BiDiMailUI.JSConsoleService.logStringMessage('no more tabs in this window');
#endif
          continue;
        }
#ifdef DEBUG_getDisplayedCopyParams
        BiDiMailUI.JSConsoleService.logStringMessage('trying tab ' + tabIndex);
#endif
        if (tabInfo[tabIndex].messageDisplay) {
          if (tabInfo[tabIndex].messageDisplay._singleMessage == false) {
#ifdef DEBUG_getDisplayedCopyParams
            BiDiMailUI.JSConsoleService.logStringMessage('multi-message mode in this tab');
#endif
            tabIndex++;
            continue;
          }
#ifdef DEBUG_getDisplayedCopyParams
          if (tabInfo[tabIndex].messageDisplay.displayedMessage)
            BiDiMailUI.JSConsoleService.logStringMessage('displayed message ID is ' +
              tabInfo[tabIndex].messageDisplay.displayedMessage.messageId);
          else 
            BiDiMailUI.JSConsoleService.logStringMessage('no displayed message');
#endif
        //displayedCopyBrowser = tabInfo[tabIndex].browser;
        }
#ifdef DEBUG_getDisplayedCopyParams
          BiDiMailUI.JSConsoleService.logStringMessage('no tabInfo.messageDisplay');
#endif
        tabIndex++;
      }
      else {
        if (messengerWindowList.hasMoreElements())
          win = messengerWindowList.getNext();
        else if (messageWindowList.hasMoreElements())
          win = messageWindowList.getNext();
        else
          break;
#ifdef DEBUG_getDisplayedCopyParams
        BiDiMailUI.JSConsoleService.logStringMessage('new window');
#endif
        try {
          // is this a tabbed window?
          // (in Seamonkey <= 2.x and Thunderbird < 3 there are
          //  no such windows)
          tabInfo =  win.document.getElementById("tabmail").tabInfo;
          tabIndex = 0;
#ifdef DEBUG_getDisplayedCopyParams
          BiDiMailUI.JSConsoleService.logStringMessage('it\'s a tabbed window, got tab list');
#endif
          continue;
        } catch(ex) { 
#ifdef DEBUG_getDisplayedCopyParams
          BiDiMailUI.JSConsoleService.logStringMessage("can't get tabs: " + ex);
#endif
        }

        try {
          // trying this is a single-message window
          // or a 3-pane displaying a single message
#ifdef DEBUG_getDisplayedCopyParams
          //BiDiMailUI.JSConsoleService.logStringMessage('win: ' + win);
          //BiDiMailUI.JSConsoleService.logStringMessage('win.opener: ' + win.opener);
          //BiDiMailUI.JSConsoleService.logStringMessage('win.opener.gFolderDisplay: ' + win.opener.gFolderDisplay);
#endif
          //if (win.opener.gFolderDisplay.selectedMessageUris.length > 1) {
            // multiple-message-display mode, we don't support that
#ifdef DEBUG_getDisplayedCopyParams
          //BiDiMailUI.JSConsoleService.logStringMessage('treating window as non-tabbed, but have multiple-message display mode, we don\'t support that');
#endif
          //  continue;
          //}
          //loadedMessageURI = win.GetLoadedMessage();
          //loadedMessageURI = win.opener.gFolderDisplay.selectedMessageUris[0];
          displayedCopyBrowser = win.getMessageBrowser();
#ifdef DEBUG_getDisplayedCopyParams
          BiDiMailUI.JSConsoleService.logStringMessage('treating window as non-tabbed and got the (main) message displayed');
#endif
        } catch(ex) {
           BiDiMailUI.JSConsoleService.logStringMessage("problem getting browser for a message displayed in window:\n" + ex);
        }
      }

      if (!displayedCopyBrowser)
        continue;

      // at this point we have a valid browser for a loaded message,
      // from some window or some tab

#ifdef DEBUG_getDisplayedCopyParams
      BiDiMailUI.JSConsoleService.logStringMessage('got some message browser...');
#endif

      loadedMessageURI = displayedCopyBrowser.contentDocument.documentURI;

      if (loadedMessageURI != messageURI) {
#ifdef DEBUG_getDisplayedCopyParams
        BiDiMailUI.JSConsoleService.logStringMessage('not our message');
#endif
        continue;
      }

#ifdef DEBUG_getDisplayedCopyParams
      BiDiMailUI.JSConsoleService.logStringMessage('found a window/tab displaying our message');
#endif

      var displayedCopyBody = displayedCopyBrowser.contentDocument.body;

#ifdef DEBUG_getDisplayedCopyParams
      BiDiMailUI.JSConsoleService.logStringMessage('body is ' + displayedCopyBody);
#endif

      for (let i=0; i < displayedCopyBody.childNodes.length; i++) {
        var subBody = displayedCopyBody.childNodes.item(i);

        if (! /^moz-text/.test(subBody.className))
          continue;
        messageParams.originalDisplayDirection = subBody.style.direction;
      }
      messageParams.correctiveRecodedUTF8 = displayedCopyBody.hasAttribute('bidimailui-recoded-utf8');
      messageParams.correctiveRecodedCharset = displayedCopyBody.getAttribute('bidimailui-recoded-charset');
      messageParams.mailnewsDecodingType = displayedCopyBody.getAttribute('bidimailui-detected-decoding-type');
      messageParams.charsetWasForced = 
        (displayedCopyBody.hasAttribute('bidimailui-charset-is-forced') ?
         (displayedCopyBody.getAttribute('bidimailui-charset-is-forced')=="true") : false);
      messageParams.gotDisplayedCopyParams = true;
    }
  },

  determineNewMessageParams : function(messageBody,messageParams) {
    try {
      messageParams.isReply = (gMsgCompose.originalMsgURI.length > 0);
    }
    catch(ex) {
      dump(ex);
    };

    if (messageParams.isReply) {
      // XXX TODO - this doesn't work for drafts;
      // they have no gMsgCompose.originalMsgURI
        BiDiMailUI.Composition.getDisplayedCopyParams(gMsgCompose.originalMsgURI,messageParams);
    }
  },

  setInitialDirection : function(messageParams) {
#ifdef DEBUG_setInitialDirection
      BiDiMailUI.JSConsoleService.logStringMessage('in BiDiMailUI.Composition.setInitialDirection');
#endif
    // determine whether we need to use the default direction;
    // this happens for new documents (e.g. new e-mail message,
    // or new composer page), and also for mail/news replies if the
    // prefs say we force the direction/ of replies to the default
    // direction for new messages
    if ( !messageParams.isReply ||
         BiDiMailUI.Prefs.getBoolPref("compose.reply_in_default_direction", false)) {
      var defaultDirection =
        BiDiMailUI.Prefs.getCharPref(
          "compose.default_direction","ltr").toLowerCase();
      switch(defaultDirection) {
        case "last_used": 
          BiDiMailUI.Composition.setDocumentDirection(
          BiDiMailUI.Prefs.getCharPref("compose.last_used_direction","ltr"));
          break;
        case "rtl": 
        case "ltr": 
          BiDiMailUI.Composition.setDocumentDirection(defaultDirection);
          break;
      }
      return;
    }
    else if (messageParams.isReply && messageParams.originalDisplayDirection) {
      BiDiMailUI.Composition.setDocumentDirection(messageParams.originalDisplayDirection);
    }
    else {
#ifdef DEBUG_setInitialDirection
      BiDiMailUI.JSConsoleService.logStringMessage(
        "We have a reply, but we don't have its original direction. We'll have to check...");
#endif
      // We get here for drafts, for messages without URIs, and due to problems
      // in locating the original message window/tab
      var detectionDirection = BiDiMailUI.directionCheck(
        document, document.getElementById("content-frame").contentDocument.body);
#ifdef DEBUG_setInitialDirection
      BiDiMailUI.JSConsoleService.logStringMessage('detectionDirection is ' + detectionDirection );
#endif
      if ((detectionDirection  == "rtl") || (detectionDirection == "mixed"))
        BiDiMailUI.Composition.setDocumentDirection("rtl");
      else if (detectionDirection == "ltr")
        BiDiMailUI.Composition.setDocumentDirection("ltr");
    }
  },

  composeWindowOnActualLoad : function() {
    var messageBody =
      document.getElementById("content-frame").contentDocument.body;

#ifdef DEBUG_composeWindowOnActualLoad
    BiDiMailUI.JSConsoleService.logStringMessage(
      '--- BiDiMailUI.Composition.composeWindowOnActualLoad() --- ');
#endif
    BiDiMailUI.Composition.handleDirectionButtons();
    // Track "Show Direction Buttons" pref.
    BiDiMailUI.Prefs.addObserver(
      BiDiMailUI.Composition.directionButtonsPrefListener.domain,
      BiDiMailUI.Composition.directionButtonsPrefListener
    );

    BiDiMailUI.Composition.handleComposeReplyCSS();

    // When this message is already on display in the main Mail&News window
    // (or a separate message window) with its direction set to some value,
    // and perhaps with some content 'manually' recoded by our extension
    // we wish to maintain the same direction and perform the same recoding
    // when bringing up the message in an editor window. Such is the case
    // for drafts and for replies; for new (empty) messages, we use a default
    // direction

    var messageParams = {
      gotDisplayedCopyParams : false,
      isReply: false,
      // the following will only be set if we can locate the message browser
      // displaying the message we're replying to
      originalDisplayDirection: null,
      correctiveRecodedUTF8: true,
      correctiveRecodedCharset: null,
      mailnewsDecodingType : null,
    };

    BiDiMailUI.Composition.determineNewMessageParams(messageBody,messageParams);

    BiDiMailUI.Composition.bodyReadyListener.messageParams = messageParams;
    // It seems that, in some cases, the listener does
    // not actually get notified when the body is ready,
    // so let's bet the body is ready within a short while... see 
    // https://bugzilla.mozilla.org/show_bug.cgi?id=429008
    // 
    // the value of 100ms is based on some trial and error with SM and TB
    // on a couple of computers... it may be that a different value is
    // necessary on some systems to get past the point when the direction
    // is set to LTR (not by us)
    BiDiMailUI.Composition.bodyReadyListener.workaroundForcingTimeoutId = 
      setTimeout(
        function() {
          BiDiMailUI.Composition.bodyReadyListener.NotifyComposeBodyReady();
        }, 400);

#ifdef DEBUG_composeWindowOnActualLoad
    BiDiMailUI.JSConsoleService.logStringMessage('isReply = ' + messageParams.isReply + 
      '\ngMsgCompose.originalMsgURI = ' +
      (gMsgCompose? gMsgCompose.originalMsgURI : 'no gMsgCompose') +
      '\noriginalDisplayDirection = ' + messageParams.originalDisplayDirection + 
      '\nUTF-8 recoded = ' + messageParams.correctiveRecodedUTF8 +
      '\ncharset recoded = ' + messageParams.correctiveRecodedCharset +
      '\nmailnews decoding type = ' + messageParams.mailnewsDecodingType +
      '\ncharset was forced = ' + messageParams.charsetWasForced      
      );
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
      BiDiMailUI.Composition.alternativeEnterBehavior =
        BiDiMailUI.Prefs.getBoolPref("compose.alternative_enter_behavior", true);
      // Applying the alternative Enter behavior requires the editor to be
      // in paragraph mode; but we won't consider doing that until the body is
      // ready.
    }

    BiDiMailUI.Composition.directionSwitchController.setAllCasters();
  },

  composeWindowOnUnload : function() {
#ifdef DEBUG_composeWindowOnUnload
    BiDiMailUI.JSConsoleService.logStringMessage('in BiDiMailUI.Composition.composeWindowOnUnload()');
#endif
    // Stop tracking "Show Direction Buttons" pref.
    BiDiMailUI.Prefs.removeObserver(
      BiDiMailUI.Composition.directionButtonsPrefListener.domain,
      BiDiMailUI.Composition.directionButtonsPrefListener
    );
    try {
      gMsgCompose.UnregisterStateListener(BiDiMailUI.Composition.bodyReadyListener);
    } catch(ex) {};
  },

  composeWindowOnLoad : function() {
    BiDiMailUI.Composition.lastWindowToHaveFocus = null;

    if (gMsgCompose) {
      BiDiMailUI.Composition.composeWindowOnActualLoad();
      document.removeEventListener("load", BiDiMailUI.Composition.composeWindowOnLoad, true);
    }
    else {
      dump("gMsgCompose not ready for this message in BiDiMailUI.Composition.composeWindowOnLoad");
    }
  },

  composeWindowOnReopen : function() {
    BiDiMailUI.Composition.lastWindowToHaveFocus = null;

    if (gMsgCompose) {
      // technically this could be a second call to BiDiMailUI.Composition.composeWindowOnActualLoad(),
      // which should only be run once, but what's happening is that the message
      // window created initially and never visible, with BiDiMailUI.Composition.composeWindowOnActualLoad()
      // having already run once, is being replicated for use with a (possibly)
      // different message 
      BiDiMailUI.Composition.composeWindowOnActualLoad();
      document.removeEventListener("compose-window-reopen", BiDiMailUI.Composition.composeWindowOnReopen, true);
      document.removeEventListener("load", BiDiMailUI.Composition.composeWindowOnLoad, true);
    }
    else {
      dump("gMsgCompose not ready for this message in BiDiMailUI.Composition.composeWindowOnReopen()");
#ifdef DEBUG_ComposeEvents
      BiDiMailUI.JSConsoleService.logStringMessage(
        "gMsgCompose not ready for this message in BiDiMailUI.Composition.composeWindowOnReopen()");
#endif
    }
  },

#ifdef DEBUG_ComposeEvents
  loadCount : 0,
  reopenCount : 0,

  debugLoadHandler : function(ev) {
    BiDiMailUI.Composition.loadCount++;
    BiDiMailUI.JSConsoleService.logStringMessage(
      'load event #' + BiDiMailUI.Composition.loadCount + ' :\ncurrentTarget = ' +
      ev.currentTarget + ' ; originalTarget = ' + ev.originalTarget + 
      ' ; explicitOriginalTarget = ' + ev.explicitOriginalTarget);
  },

  debugLoadHandlerNonCapturing : function() {
    BiDiMailUI.JSConsoleService.logStringMessage(
      'this is a non-capturing load event');
  },

  debugReopenHandler : function(ev) {
    BiDiMailUI.Composition.reopenCount++;
    BiDiMailUI.JSConsoleService.logStringMessage(
      'compose-window-reopen event #' + BiDiMailUI.Composition.reopenCount +
      ' :\ncurrentTarget = ' + ev.currentTarget + ' ; originalTarget = ' +
      ev.originalTarget + ' ; explicitOriginalTarget = ' + 
      ev.explicitOriginalTarget);
  },
  
  debugReopenHandlerNonCapturing : function() {
    BiDiMailUI.JSConsoleService.logStringMessage(
      'this is a non-capturing compose-window-reopen event');
  },
#endif

  installComposeWindowEventHandlers : function() {
    top.controllers.appendController(
      BiDiMailUI.Composition.directionSwitchController);
#ifdef DEBUG_ComposeEvents
    window.addEventListener("load", 
      BiDiMailUI.Composition.debugLoadHandler, true);
    window.addEventListener("compose-window-reopen",
      BiDiMailUI.Composition.debugReopenHandler, true);
    window.addEventListener("load",
      BiDiMailUI.Composition.debugLoadHandlerNonCapturing, false);
    window.addEventListener("compose-window-reopen",
      BiDiMailUI.Composition.debugReopenHandlerNonCapturing, false);
#endif
    window.addEventListener("load", 
      BiDiMailUI.Composition.composeWindowOnLoad, false);
    window.addEventListener("compose-window-reopen",
      BiDiMailUI.Composition.composeWindowOnReopen, true);
    window.addEventListener("unload", BiDiMailUI.Composition.composeWindowOnUnload, true);
    window.addEventListener("keypress", BiDiMailUI.Composition.onKeyPress, true);
    if (BiDiMailUI.Prefs.getBoolPref(
      "compose.ctrl_shift_switches_direction", true)) {
      document.addEventListener("keydown", BiDiMailUI.Composition.onKeyDown, true);
      document.addEventListener("keyup", BiDiMailUI.Composition.onKeyUp, true);
    }
  },

  findClosestBlockElement : function(node) {
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
  },

  applyDirectionSetterToSelectionBlockElements : function(newDirectionSetter) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
    BiDiMailUI.JSConsoleService.logStringMessage(
      '----- BiDiMailUI.Composition.applyDirectionSetterToSelectionBlockElements() -----');
#endif
    var editor = GetCurrentEditor();
    if (!editor) {
      dump("Could not acquire editor object.");
      return;
    }

    if (editor.selection.rangeCount > 0) {
      editor.beginTransaction();
      try {
        for (let i=0; i < editor.selection.rangeCount; ++i) {
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

#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
          BiDiMailUI.JSConsoleService.logStringMessage(
            'endContainer:' + endContainer + "\ntype: " +
            endContainer.nodeType + "\nHTML:\n" + endContainer.innerHTML +
            "\nvalue:\n" + endContainer.nodeValue);
#endif

          var node = startContainer;
          // walk the tree till we find the endContainer of the selection range,
          // giving our directionality style to everything on our way
          do {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
            BiDiMailUI.JSConsoleService.logStringMessage(
              'visiting node:' + node + "\ntype: " + node.nodeType +
              "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif

            var closestBlockElement = BiDiMailUI.Composition.findClosestBlockElement(node);
            if (closestBlockElement) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              BiDiMailUI.JSConsoleService.logStringMessage(
                'found closestBlockElement:' + closestBlockElement +
                "\ntype: " + closestBlockElement.nodeType + "\nHTML:\n" + 
                closestBlockElement.innerHTML + "\nvalue:\n" +
                closestBlockElement.nodeValue);
#endif
              closestBlockElement.style.direction =
                newDirectionSetter(closestBlockElement.style.direction);
            }
            else {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              BiDiMailUI.JSConsoleService.logStringMessage('could not find cbe');
#endif
              break;
            }

            // This check should be placed here, not as the 'while'
            // condition, to handle cases where begin == end
            if (node == endContainer) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              BiDiMailUI.JSConsoleService.logStringMessage('at end container, stopping traversal');
#endif
              break;
            }

            // Traverse the tree in order
            if (node.firstChild) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              BiDiMailUI.JSConsoleService.logStringMessage('descending to first child');
#endif
              node = node.firstChild;
            }
            else if (node.nextSibling) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              BiDiMailUI.JSConsoleService.logStringMessage('moving to next sibling');
#endif
              node = node.nextSibling;
            }
            else {
              // find an ancestor which has anything else after our node
              while (node.parentNode != null) {
                node = node.parentNode;
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
                BiDiMailUI.JSConsoleService.logStringMessage('moved up to parent node');
#endif
                if (node.nextSibling) {
                  node = node.nextSibling;
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
                  BiDiMailUI.JSConsoleService.logStringMessage('moved to next sibling');
#endif
                  break;
                }
              }
            }
          } while(node);
        }
      } finally { editor.endTransaction(); }
    }
  },

  clearParagraphDirection : function() {
    BiDiMailUI.Composition.applyDirectionSetterToSelectionBlockElements(
      function(oldDirection) { return null; }
      );
  },

  setParagraphDirection : function(dir) {
    BiDiMailUI.Composition.applyDirectionSetterToSelectionBlockElements(
      function(oldDirection) { return dir; }
      );
  },

  SwitchParagraphDirection : function() {
    BiDiMailUI.Composition.applyDirectionSetterToSelectionBlockElements(
      function(oldDirection) { return (oldDirection == "rtl" ? "ltr" : "rtl"); }
      );
  },

  getDefaultPreventedWrapper : function(ev) {
	try {
      // This should be valid for Thunderbird 13.0 and later, see:
      // https://bugzilla.mozilla.org/show_bug.cgi?id=708702 
      return ev.defaultPrevented;
    }
    catch(ex) { 
      return ev.getPreventDefault();
	}
  },

  onKeyDown : function(ev) {
    if (
      // The content element isn't focused
      top.document.commandDispatcher.focusedWindow != content ||
      // The defaultPrevented flag is set on the event
      // (see http://bugzilla.mozdev.org/show_bug.cgi?id=12748)
      BiDiMailUI.Composition.getDefaultPreventedWrapper(ev) ) 
    {
      return;
    }

    // detect Ctrl+Shift key combination, and switch direction if it
    // is used

#ifdef DEBUG_keypress
    if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key down    : Shift');
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key down    : Ctrl');
    else BiDiMailUI.JSConsoleService.logStringMessage('key up      : Other');
#endif

    if ((ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) ||
        (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)) {
      if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode) {
        // Ctrl going down begins the Ctrl+Shift press sequence
        BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = true;
        BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
      }
      else { // ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode
        if (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1) {
    // Shift going down immediately after Ctrl going is part 2 of
    // the Ctrl+Shift press sequence
    BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = true;
        }
        else { // BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 == false
    // If the Shift goes down but not right after the Ctrl, then it's
    // not the relevant sequence
    BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
        }
      }
    } else {
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = false;
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
    }

#ifdef DEBUG_keypress
    BiDiMailUI.JSConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);
    BiDiMailUI.JSConsoleService.logStringMessage('sequence vars: ' + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 ? 'T ' : 'F ') + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 ? 'T ' : 'F '));
#endif
  },

  onKeyUp : function(ev) {
    if (
        // The content element isn't focused
        top.document.commandDispatcher.focusedWindow != content ||
        // The preventDefault flag is set on the event
        // (see http://bugzilla.mozdev.org/show_bug.cgi?id=12748)
        BiDiMailUI.Composition.getDefaultPreventedWrapper(ev))
      return;

    // detect Ctrl+Shift key combination, and switch direction if it
    // is used

#ifdef DEBUG_keypress
    if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key up      : Shift');
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key up      : Ctrl');
    else BiDiMailUI.JSConsoleService.logStringMessage('key up      : Other');
#endif

    if ((ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) ||
        (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)) {
      if (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 &&
          BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2) {
        if (IsHTMLEditor()) {
#ifdef DEBUG_keypress
    BiDiMailUI.JSConsoleService.logStringMessage('SWITCHING paragraph');
#endif
    BiDiMailUI.Composition.SwitchParagraphDirection();
        }
        else {
#ifdef DEBUG_keypress
          BiDiMailUI.JSConsoleService.logStringMessage('SWITCHING document');
#endif
          BiDiMailUI.Composition.switchDocumentDirection();
        }
        BiDiMailUI.Composition.directionSwitchController.setAllCasters();
        // if Shift has gone up, Ctrl is still down and the next
        // Ctrl+Shift does need releasing it
        BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = 
          (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode);
        BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
      }
    } else {
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = false;
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
    }

#ifdef DEBUG_keypress
  BiDiMailUI.JSConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);
    BiDiMailUI.JSConsoleService.logStringMessage('sequence vars: ' +
    (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 ? 'T ' : 'F ') +
    (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 ? 'T ' : 'F '));
#endif
  },

  onKeyPress : function(ev) {
    // TODO: Shouldn't we also check for focus here, like in keyup and keydown?
	// And if so - should we factor out the check?

    if (// The preventDefault flag is set on the event
        // (see http://bugzilla.mozdev.org/show_bug.cgi?id=12748)
      BiDiMailUI.Composition.getDefaultPreventedWrapper(ev)) 
      return;

    // detect Ctrl+Shift key combination, and switch direction if it
    // is used

#ifdef DEBUG_keypress
    if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key pressed : Shift');
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)
      BiDiMailUI.JSConsoleService.logStringMessage('key pressed : Ctrl');
    else BiDiMailUI.JSConsoleService.logStringMessage('key up      : Other');
#endif

    if ((ev.keyCode != BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) &&
        (ev.keyCode != BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)) {
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = false;
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
    }

#ifdef DEBUG_keypress
    BiDiMailUI.JSConsoleService.logStringMessage(
      'sequence vars: ' + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 ? 'T ' : 'F ') +
      (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 ? 'T ' : 'F '));
#endif

    if (
      // alternative Enter key handling preffed off
      !BiDiMailUI.Composition.alternativeEnterBehavior ||  
      // The editor element isn't focused
      top.document.commandDispatcher.focusedWindow != content ||
      // text-plain message, no paragraph-related issues when pressing Enter
      !IsHTMLEditor())
      return;

    var editor = GetCurrentEditor();

    // Steal all plain enters without modifiers (e.g. do not change
    // behaivor of Shift+Enter which inserts a <br>, Ctrl+Enter which
    // sends the message etc.)
    if ((ev.keyCode == KeyEvent.DOM_VK_ENTER || ev.keyCode == KeyEvent.DOM_VK_RETURN) &&
        !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey &&
        !BiDiMailUI.Composition.editorIsInListState()) {
      // but don't do this if we're not in paragraph mode...
      // (getParagraphState returns the paragraph state for the selection.)
      editor = GetCurrentEditor();
      var isParMixed = { value: false }; // would be ignored
      var parState = editor.getParagraphState(isParMixed);

      // We currently apply our own enter behavior to
      // paragraph states "p" and "h1" through "h6"; specifically,
      // we don't apply it in Body Text mode 

      if (parState != "p" && parState.length != 2 )
        return;

      // Do whatever it takes to prevent the editor from inserting a BR
      ev.preventDefault();
      ev.stopPropagation();

      // ... and insert a paragraph break instead
      BiDiMailUI.Composition.insertParagraph();
    }
    // If the backspace key has been pressed at this state:
    // <p>[p1 content]</p><p><caret />[p2 content]</p>
    // The expected result is
    // <p>[p1 content][p2 content]</p>
    // (NOT: <p>[p1 content]<br>[p2 content]</p> as nsIHTMLEditor's impl')
    else if (ev.keyCode == KeyEvent.DOM_VK_BACK_SPACE) {
      if (editor.selection.isCollapsed) {
        var par = BiDiMailUI.Composition.findClosestBlockElement(editor.selection.focusNode);
        var prevPar = par.previousSibling;
        if (par && prevPar &&
          prevPar.tagName.toLowerCase() == "p" &&
          par.tagName.toLowerCase() == "p" &&
          BiDiMailUI.Composition.isFirstTextNode(par, editor.selection.focusNode, false) &&
          editor.selection.focusOffset == 0) {

          // combine the two paragraphs into a single paragraph
#ifdef DEBUG_keypress
          BiDiMailUI.JSConsoleService.logStringMessage('unifying paragraphs\n------------------------');
          BiDiMailUI.JSConsoleService.logStringMessage('prevPar is:' + prevPar + "\ntype: " + prevPar.nodeType + "\nname: " + prevPar.nodeName + "\nHTML:\n" + prevPar.innerHTML + "\nOuter HTML:\n" + prevPar.innerHTML + "\nvalue:\n" + prevPar.nodeValue);
          BiDiMailUI.JSConsoleService.logStringMessage('par is:' + par + "\ntype: " + par.nodeType + "\nname: " + par.nodeName + "\nHTML:\n" + par.innerHTML + "\nOuter HTML:\n" + par.innerHTML + "\nvalue:\n" + par.nodeValue);
#endif
          editor.beginTransaction();

          var newPar = prevPar.cloneNode(true);
          var pChild = par.firstChild;

          // if nextPar is an 'empty' par in the sense of only having a <br> (editor idiosyncracy),
          // we won't add the extra <br>
          if (par.childNodes.length == 1 && pChild.nodeName == "BR") {
#ifdef DEBUG_keypress
            BiDiMailUI.JSConsoleService.logStringMessage('just removing an empty paragraph');
#endif
            prevPar.parentNode.removeChild(par);
          }

          // if the last node of the first par and the first node of the next par are both
          // text nodes, we'll unify them (DISABLED for now, since the editor is behaving weirdly;
          // this means we can now have consequent text nodes after the unification)
          //if (npChild && par.lastChild) {
          //  if ((npChild.nodeType == Node.TEXT_NODE) && (par.lastChild.nodeType == Node.TEXT_NODE)) {
          //    par.lastChild.nodeValue = par.lastChild.nodeValue + npChild.nodeValue;
          //    //BiDiMailUI.JSConsoleService.logStringMessage('par.lastChild.nodeValue = \"' + par.lastChild.nodeValue + '\"');
          //    npChild = npChild.nextSibling;
          //  }
          //}
          else {
            var nc = prevPar.childNodes.length;
            while (pChild) {
             var pc2 = pChild;
              pChild = pChild.nextSibling;
#ifdef DEBUG_keypress
              BiDiMailUI.JSConsoleService.logStringMessage(
                'copying pcClone:' + pcClone + "\ntype: " + pcClone.nodeType +
                "\nname: " + pcClone.nodeName + "\nHTML:\n" + pcClone.innerHTML +
                "\nOuter HTML:\n" + pcClone.innerHTML + "\nvalue:\n" + pcClone.nodeValue);
#endif
              newPar.appendChild(pc2);
            }
            prevPar.parentNode.removeChild(par);
            prevPar.parentNode.replaceChild(newPar,prevPar);
            editor.selection.collapse(newPar, nc);
          }
          editor.endTransaction();
#ifdef DEBUG_keypress
          BiDiMailUI.JSConsoleService.logStringMessage('done');
#endif
          ev.preventDefault();
          ev.stopPropagation();
        }
      }  
    }
  },

  /* Comment Me! */
  isFirstTextNode : function(blockElement, node, found) {
    if (node == blockElement)
      return found;

    var parentNode = node.parentNode;
    for (; node != parentNode.fisrtChild ; node=node.previousSibling) {
      if (node.nodeType == node.TEXT_NODE)
        if (found)
          return false;
        else
          found = true;
    }
    return (
      BiDiMailUI.Composition.isFirstTextNode(blockElement, parentNode, found)); 
  },

  editorIsInListState : function() {
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
  },

  getParagraphMarginFromPrefs : function() {
    var basePrefName = "compose.space_between_paragraphs";
    var marginScale = BiDiMailUI.Prefs.getCharPref(basePrefName + ".scale", "cm");
    var marginVal;
    if (marginScale != "px") {
      marginVal =
        parseFloat(BiDiMailUI.Prefs.getCharPref(basePrefName + ".value", "0"), 10);
    }
    else {
      marginVal =
        parseInt(BiDiMailUI.Prefs.getCharPref(basePrefName + ".value", "0"), 10);
    }
    if (isNaN(marginVal))
      marginVal = "0";

    return (marginVal + marginScale);
  },

  // This function attempts to break off the remainder of the current
  // line into a new paragraph; it assumes we are not within a list

  insertParagraph : function() {
    var editor = GetCurrentEditor();
    if (!editor) {
#ifdef DEBUG_insertParagraph
      BiDiMailUI.JSConsoleService.logStringMessage('Could not acquire editor object.');
#endif
      dump("Could not acquire editor object.");
      return;
    }

    editor.beginTransaction();

    if (!editor.selection.isCollapsed)
      editor.deleteSelection(editor.eNone);

    editor.insertLineBreak();

    // -- Remember the old style rules before we move into paragraph mode --

    // we need to pass these objects to the GetTextProperty function,
    // but we don't need the return values
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
    try {
      var styleFontColor = editor.getFontColorState(allHas);
    } catch(ex) {
#ifdef DEBUG_insertParagraph
      BiDiMailUI.JSConsoleService.logStringMessage('Failed obtaining the font color using editor.getFontColorState():\n' + ex);
#endif
      try {
        styleFontColor = document.defaultView
              .getComputedStyle(editor.getSelectionContainer(), "")
              .getPropertyValue("font-color");
        var elt = BiDiMailUI.Composition.findClosestBlockElement(editor.getSelectionContainer());
        isStyleFontColor.value = (styleFontColor != document.defaultView
                      .getComputedStyle(elt, "")
                      .getPropertyValue("font-color"));
      }
      catch(ex) { 
#ifdef DEBUG_insertParagraph
        BiDiMailUI.JSConsoleService.logStringMessage('Failed obtaining the font color using document.defaultView.getComputedStyle():\n' + ex);
#endif
      }
    }   

    // solution for <big>, <small> and font-face tags:
    // we compare the computed font-size of the selction to the font-size of
    // its block element. If it is different, we'll apply font-size
    var isStyleFontSize = { value: false };
    var styleFontSize;
    try {
      styleFontSize = document.defaultView
            .getComputedStyle(editor.getSelectionContainer(), "")
            .getPropertyValue("font-size");
      var elt = BiDiMailUI.Composition.findClosestBlockElement(editor.getSelectionContainer());
      isStyleFontSize.value = (styleFontSize != document.defaultView
                    .getComputedStyle(elt, "")
                    .getPropertyValue("font-size"));
    }
    catch(ex) { }
    // -- "Remember old style"

    editor.setParagraphFormat("p");
    var par = BiDiMailUI.Composition.findClosestBlockElement(editor.selection.focusNode);
    var prevPar = par.previousSibling;

    // Hunt down and shoot the extra BR. We don't want it.
    // Go up to the last child.
    // e.g. <p><b>foo<br></b></p> -- we accend to B, then to BR.
    var node;
    for (node = prevPar.lastChild; node && node.lastChild; node = node.lastChild);
    // Make sure:
    // 1. It's a BR,
    // 2. It's not the special case of the BR being an only child (thus
    //    not a candidate for removal -- we need it to keep the P
    //    from becoming empty)
    if (node && ('nodeType' in node) 
        && node.nodeType == node.ELEMENT_NODE 
        && node.tagName.toLowerCase() == "br") 
    {
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
    par.style.direction = prevPar.style.direction;

    // ------------------------------- "set old style" ------

    // Make sure the line in which the caret is in is visible
    try {
      var selCon = editor.selectionController;
      if (selCon) {
        selCon.scrollSelectionIntoView(
        Components.interfaces.nsISelectionController.SELECTION_NORMAL,
        Components.interfaces.nsISelectionController.SELECTION_FOCUS_REGION,
        true);
      }
    }
    catch(ex) {
      dump(ex);
    }
  },

  commandUpdate_MsgComposeDirection : function() {
    var focusedWindow = top.document.commandDispatcher.focusedWindow;

    // we're just setting focus to where it was before
    if (focusedWindow == BiDiMailUI.Composition.lastWindowToHaveFocus)
      return;

    BiDiMailUI.Composition.lastWindowToHaveFocus = focusedWindow;
    BiDiMailUI.Composition.directionSwitchController.setAllCasters();
  }
  
}

BiDiMailUI.Composition.directionSwitchController = {
  supportsCommand: function(command) {
    switch (command) {
      case "cmd_rtl_paragraph":
      case "cmd_ltr_paragraph":
      case "cmd_rtl_document":
      case "cmd_ltr_document":
      case "cmd_switch_paragraph":
      case "cmd_switch_document":
      case "cmd_clear_paragraph_dir":
      case "cmd_insert_lrm":
      case "cmd_insert_rlm":
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
      case "cmd_insert_lrm":
      case "cmd_insert_rlm":
        retVal = inMessage || inSubjectBox;
        break;

      case "cmd_ltr_document":
        this.setCasterGroup("document",inMessage,inSubjectBox);
      case "cmd_rtl_document":
        retVal = inMessage || inSubjectBox;
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_document
        break;

      case "cmd_ltr_paragraph":
        if (IsHTMLEditor())
          this.setCasterGroup("paragraph",inMessage,inSubjectBox);
      case "cmd_rtl_paragraph":
        retVal = inMessage;
        // necessary side-effects performed when
        // isCommandEnabled is called for cmd_ltr_paragraph
        break;
    }

#ifdef DEBUG_isCommandEnabled
    BiDiMailUI.JSConsoleService.logStringMessage('isCommandEnabled for command "' + command + '". inMessage: ' + inMessage + ' , inSubjectBox = ' + inSubjectBox + ' , retVal = ' + retVal);
#endif


    return retVal;
  },

  setCasterGroup: function(casterPair,inMessage,inSubjectBox) {
#ifdef DEBUG_setCasterGroup
    BiDiMailUI.JSConsoleService.logStringMessage('setting caster group ' + casterPair);
#endif
    var casterID, oppositeCasterID, command, direction, commandsAreEnabled;

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
        commandsAreEnabled = inMessage || inSubjectBox;
        break;
      case "paragraph":
        command = "cmd_ltr_paragraph";
        casterID = "ltr-paragraph-direction-broadcaster";
        oppositeCasterID = "rtl-paragraph-direction-broadcaster";
      
        direction = BiDiMailUI.Composition.getCurrentSelectionDirection();
      
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
#ifdef DEBUG_setAllCasters
      BiDiMailUI.JSConsoleService.logStringMessage('setting casters.');
#endif
    var inMessage = (content == top.document.commandDispatcher.focusedWindow);
    var inSubjectBox = 
      (document.commandDispatcher.focusedElement ==
       document.getElementById("msgSubject").inputField);
    var retVal = false;

    this.setCasterGroup("document",inMessage,inSubjectBox);
    this.setCasterGroup("paragraph",inMessage,inSubjectBox);
  },

  doCommand: function(command) {
    switch (command) {
      case "cmd_rtl_paragraph":
        BiDiMailUI.Composition.setParagraphDirection("rtl");
        break;
      case "cmd_ltr_paragraph":
        BiDiMailUI.Composition.setParagraphDirection("ltr");
        break;
      case "cmd_rtl_document":
        BiDiMailUI.Composition.setDocumentDirection("rtl");
        break;
      case "cmd_ltr_document":
        BiDiMailUI.Composition.setDocumentDirection("ltr");
        break;
      case "cmd_switch_paragraph":
        BiDiMailUI.Composition.switchParagraphDirection();
        break;
      case "cmd_switch_document":
        BiDiMailUI.Composition.switchDocumentDirection();
        break;
      case "cmd_clear_paragraph_dir":
        BiDiMailUI.Composition.clearParagraphDirection();
        break;
      case "cmd_insert_lrm":
        BiDiMailUI.Composition.insertControlCharacter('\u200e');
        break;
      case "cmd_insert_rlm":
        BiDiMailUI.Composition.insertControlCharacter('\u200f');
        break;

      default:
        dump("The command \"" + command +
             "\" isn't supported by the directionality controller\n");
        return false;
    }
    this.setAllCasters();
  },
}

BiDiMailUI.Composition.directionButtonsPrefListener = {
  domain: "extensions.bidiui.mail.compose.show_direction_buttons",
  observe: function(subject, topic, prefName) {
    if (topic != "nsPref:changed")
      return;
    BiDiMailUI.Composition.handleDirectionButtons();
  }
}
