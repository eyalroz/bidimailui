var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");
var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");

BiDiMailUI.Composition = {

  lastWindowToHaveFocus : null,
    // used to prevent doing unnecessary work when a focus
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

  getCurrentSelectionDirection : function() {
#ifdef DEBUG_GetCurrentSelectionDirection
     console.log('----- in GetCurrentSelectionDirection() -----');
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
      console.log('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nHTML:\n" + cac.innerHTML);
      console.log('commonAncestorContainer:' + cac + "\ntype:" + cac.nodeType + "\nvalue:\n" + cac.nodeValue + "\nis LTR = " + cacIsLTR + "; is RTL = " + cacIsRTL);
#endif

      if (cac.nodeType == Node.TEXT_NODE) {
        // the range is some text within a single DOM leaf node
        // so there's no need for any traversal
#ifdef DEBUG_GetCurrentSelectionDirection
        console.log('just a text node, continuing');
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
          console.log('visiting start slope node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
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
                  console.log('found LTR');
#endif
                  if (hasRTL)
                    return "complex";
                break;
              case "rtl":
                hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                console.log('found RTL');
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
        console.log('visiting node:' + node + "\ntype: " + node.nodeType + "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
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
                console.log('found LTR');
#endif
                if (hasRTL)
                  return "complex";
                break;
              case "rtl":
                hasRTL = true;
#ifdef DEBUG_GetCurrentSelectionDirection
                console.log('found RTL');
#endif
                if (hasLTR)
                  return "complex";
                break;
            }
          }
          else if (node.parentNode == cac) {
      // there is a non-block child of cac, so we use cac's data
#ifdef DEBUG_GetCurrentSelectionDirection
            console.log('non-block child of cac, using cac direction');
#endif
            hasLTR = hasLTR || cacIsLTR;
            hasRTL = hasRTL || cacIsRTL;
            if (hasLTR && hasRTL)
              return "complex";
          }
        }

        if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
          console.log('at end container, stopping traversal');
#endif
          break; // proceed to the next selection range
        }

        // is there is a child node which need be traversed?

        if (node.firstChild) {
#ifdef DEBUG_GetCurrentSelectionDirection
          console.log('descending to first child');
#endif
          node = node.firstChild;
        // fallthrough to sibling search in case first child is a text node
          if  (node.nodeType != Node.TEXT_NODE)
            continue; // we've found the next node to visit
          else if (node == range.endContainer) {
#ifdef DEBUG_GetCurrentSelectionDirection
            console.log('at TEXT_NODE endContainer, stopping traversal');
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
            console.log('moving to next sibling');
#endif
            if  (node.nodeType != Node.TEXT_NODE)
              break; // we've found the next node to visit
            else continue; // try the next sibling
          }
          else node = node.parentNode;
#ifdef DEBUG_GetCurrentSelectionDirection
          console.log('moving back up');
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
    console.log('--- SetDocumentDirection( \'' + direction + '\' ) ---');
#endif

    let messageEditor = BiDiMailUI.getMessageEditor(document);
    if (messageEditor) {
      messageEditor.contentDocument.body.style.direction = direction;
    }
#ifdef DEBUG_SetDocumentDirection
    else {
      console.log('could not get the message editor / content frame by ID - that shouldn\'t be possible');
    }
#endif
    document.getElementById("msgSubject").style.direction = direction;
    BiDiMailUI.Prefs.set("compose.last_used_direction", direction);
  },

  // This inserts any character, actually
  insertControlCharacter : function(controlCharacter) {
    editor = GetCurrentEditor();
    editor.beginTransaction();
    editor.insertText(controlCharacter);
    editor.endTransaction();
  },

  switchDocumentDirection : function() {
    var body = BiDiMailUI.getMessageEditor(document).contentDocument.body;
    var currentDir = window.getComputedStyle(body, null).direction;

    // Note: Null/empty value means LTR, so we check for RTL only

    if (currentDir == "rtl")
      BiDiMailUI.Composition.directionSwitchController.doCommand("cmd_ltr_document");
    else
      BiDiMailUI.Composition.directionSwitchController.doCommand("cmd_rtl_document");
  },

  handleComposeReplyCSS : function() {
    if (IsHTMLEditor()) {
      let domWindowUtils = GetCurrentEditorElement().contentWindow.windowUtils;
      domWindowUtils.loadSheetUsingURIString("chrome://bidimailui/content/quotebar.css", domWindowUtils.AGENT_SHEET);
#ifdef DEBUG_handleComposeReplyCSS
      console.log('Added the quotebar fix stylesheet to the HTML editor document');
#endif
    }
  },

  getMessageHead : function() {
    // assuming the head is the edited document element's first child
    return BiDiMailUI.getMessageEditor(document).contentDocument.documentElement.firstChild;
  },

  ensureMessageStyleRulesAdded : function(styleElementId, styleRulesText) {
    let headElement = BiDiMailUI.Composition.getMessageHead();
    let contentDoc = headElement.ownerDocument;
    if (contentDoc.getElementById(styleElementId) != null) {
      return;
    }

    let editor = GetCurrentEditor();
    if (!editor) {
      console.error('Failed to obtain editor in ensureMessageStyleRulesAdded()');
      return;
    }

    editor.beginTransaction();
    let styleElement = contentDoc.createElement('style');
    styleElement.id = styleElementId;
    styleElement.type = "text/css";
    styleElement.textContent = styleRulesText;
    // TODO: Is it more "proper" to wrap the text in a textnode?
    // styleElement.appendChild(contentDoc.createTextNode(styleRulesText));
    headElement.appendChild(styleElement);
    editor.endTransaction();
  },

  handleDirectionButtons : function() {
    var hiddenButtonsPref =
      !BiDiMailUI.Prefs.get("compose.show_direction_buttons", true);

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

    var margin = BiDiMailUI.Composition.getParagraphMarginFromPrefs();
    BiDiMailUI.Composition.ensureMessageStyleRulesAdded(
      "bidiui-paragraph-margins",
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
      console.log('setParagraphMode  failed to acquire editor object.');
#endif
      dump('setParagraphMode failed to acquire editor object.');
      return;
    }
    editor.document.execCommand("defaultparagraphseparator", true, modeStr);
    // as we don't use doStatefulCommand, we need to update the command
    // state attribute...
    document.getElementById("cmd_paragraphState").setAttribute("state", modeStr);
  },

  getDisplayedCopyParams : function(messageURI,messageParams) {
#ifdef DEBUG_getDisplayedCopyParams
      console.log('getDisplayedCopyParams for message\n' + messageURI);
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
    var messengerWindowList = Services.wm.getEnumerator("mail:3pane");
    var messageWindowList = Services.wm.getEnumerator("mail:messageWindow");
    var tabInfo,tabIndex;

    while (true) {
#ifdef DEBUG_getDisplayedCopyParams
      console.log('loop iteration');
#endif

      // get the next browser for a loaded message

      if (tabInfo) {
        // we've gotten that tab info for some window and are
        // traversing all tabs
        if (tabIndex == tabInfo.length) {
          tabInfo = null;
#ifdef DEBUG_getDisplayedCopyParams
           console.log('no more tabs in this window');
#endif
          continue;
        }
#ifdef DEBUG_getDisplayedCopyParams
        console.log('trying tab ' + tabIndex);
#endif
        if (tabInfo[tabIndex].messageDisplay) {
          if (tabInfo[tabIndex].messageDisplay._singleMessage == false) {
#ifdef DEBUG_getDisplayedCopyParams
            console.log('multi-message mode in this tab');
#endif
            tabIndex++;
            continue;
          }
#ifdef DEBUG_getDisplayedCopyParams
          if (tabInfo[tabIndex].messageDisplay.displayedMessage)
            console.log('displayed message ID is ' +
              tabInfo[tabIndex].messageDisplay.displayedMessage.messageId);
          else
            console.log('no displayed message');
#endif
        //displayedCopyBrowser = tabInfo[tabIndex].browser;
        }
#ifdef DEBUG_getDisplayedCopyParams
          console.log('no tabInfo.messageDisplay');
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
        console.log('new window');
#endif
        try {
          // is this a tabbed window?
          // (in Seamonkey <= 2.x and Thunderbird < 3 there are
          //  no such windows)
          tabInfo =  win.document.getElementById("tabmail").tabInfo;
          tabIndex = 0;
#ifdef DEBUG_getDisplayedCopyParams
          console.log('it\'s a tabbed window, got tab list');
#endif
          continue;
        } catch(ex) {
#ifdef DEBUG_getDisplayedCopyParams
          console.log("can't get tabs: " + ex);
#endif
        }

        try {
          displayedCopyBrowser = win.getMessageBrowser();
#ifdef DEBUG_getDisplayedCopyParams
          console.log('treating window as non-tabbed and got the (main) message displayed');
#endif
        } catch(ex) {
           console.log("problem getting browser for a message displayed in window:\n" + ex);
        }
      }

      if (!displayedCopyBrowser)
        continue;

      // at this point we have a valid browser for a loaded message,
      // from some window or some tab

#ifdef DEBUG_getDisplayedCopyParams
      console.log('got some message browser...');
#endif

      loadedMessageURI = displayedCopyBrowser.contentDocument.documentURI;

      if (loadedMessageURI != messageURI) {
#ifdef DEBUG_getDisplayedCopyParams
        console.log('not our message');
#endif
        continue;
      }

#ifdef DEBUG_getDisplayedCopyParams
      console.log('found a window/tab displaying our message');
#endif

      var displayedCopyBody = displayedCopyBrowser.contentDocument.body;

#ifdef DEBUG_getDisplayedCopyParams
      console.log('body is ' + displayedCopyBody);
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
    if (!gMsgCompose) {
      console.error("Expected the global gMsgCompose to be ready by now.");
      messageParams.isReply = false;
    }
    else {
      messageParams.isReply = gMsgCompose.originalMsgURI ?
          (gMsgCompose.originalMsgURI.length > 0) : false;
    }

    if (messageParams.isReply) {
      // XXX TODO - this doesn't work for drafts;
      // they have no gMsgCompose.originalMsgURI
        BiDiMailUI.Composition.getDisplayedCopyParams(gMsgCompose.originalMsgURI, messageParams);
    }
  },

  setInitialDirection : function(messageParams) {
#ifdef DEBUG_setInitialDirection
      console.log('in BiDiMailUI.Composition.setInitialDirection');
#endif
    // determine whether we need to use the default direction;
    // this happens for new documents (e.g. new e-mail message,
    // or new composer page), and also for mail/news replies if the
    // prefs say we force the direction/ of replies to the default
    // direction for new messages
    if ( !messageParams || !messageParams.isReply ||
         BiDiMailUI.Prefs.get("compose.reply_in_default_direction", false)) {
      let defaultDirection = BiDiMailUI.Prefs.get(
          "compose.default_direction","ltr").toLowerCase();
      let initialDirection;
      switch(defaultDirection) {
        case "last_used":
          initialDirection = BiDiMailUI.Prefs.get("compose.last_used_direction","ltr");
          break;
        default:
          initialDirection = defaultDirection;
      }
#ifdef DEBUG_setInitialDirection
      console.log("Setting initial direction by preference \"" + defaultDirection + "\" to " + initialDirection);
#endif
      BiDiMailUI.Composition.setDocumentDirection(initialDirection);
      return;
    }
    else if (messageParams.isReply && messageParams.originalDisplayDirection) {
      BiDiMailUI.Composition.setDocumentDirection(messageParams.originalDisplayDirection);
    }
    else {
#ifdef DEBUG_setInitialDirection
      console.log("We have a reply, but we don't have its original direction. We'll have to check...");
#endif
      // We get here for drafts, for messages without URIs, and due to problems
      // in locating the original message window/tab
      let detectionDirection = BiDiMailUI.directionCheck(
        document, NodeFilter, BiDiMailUI.getMessageEditor(document).contentDocument.body);
#ifdef DEBUG_setInitialDirection
      console.log('detectionDirection is ' + detectionDirection);
#endif
      if ((detectionDirection  == "rtl") || (detectionDirection == "mixed"))
        BiDiMailUI.Composition.setDocumentDirection("rtl");
      else if (detectionDirection == "ltr")
        BiDiMailUI.Composition.setDocumentDirection("ltr");
    }
  },

  onEverythingLoadedAndReady : function() {
#ifdef DEBUG_onEverythingLoadedAndReady
    console.log('--- BiDiMailUI.Composition.onEverythingLoadedAndReady() --- ');
#endif

    let messageEditor = BiDiMailUI.getMessageEditor(document);
    let messageBody = messageEditor.contentDocument.body;
    if (messageBody === null) {
      console.error("message body is unavailable in onEverythingLoadedAndReady()");
      return; // Hopefully we should get called again
    }

    BiDiMailUI.Composition.handleDirectionButtons();
    // Track "Show Direction Buttons" pref.
    Services.prefs.addObserver(
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

    let messageParams = {
      gotDisplayedCopyParams : false,
      isReply: false,
      // the following will only be set if we can locate the message browser
      // displaying the message we're replying to
      originalDisplayDirection: null,
      correctiveRecodedUTF8: true,
      correctiveRecodedCharset: null,
      mailnewsDecodingType : null,
    };

    BiDiMailUI.Composition.determineNewMessageParams(messageBody, messageParams);

    var clearMisdetectionCorrectionParams = {
      body: BiDiMailUI.getMessageEditor(document).contentDocument.body,
      charsetOverrideInEffect: true,
        // it seems we can't trigger a reload by changing the charset
        // during composition, the change only affects how the message
        // is encoded eventually based on what we already have in the
        // window
      currentCharset: gMsgCompose.compFields.characterSet,
      messageHeader:
        (messageParams.isReply ?
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

    if (!messageParams.isReply ||
        !messageParams.gotDisplayedCopyParams ||
        messageParams.charsetWasForced ||
        messageParams.correctiveRecodedUTF8 ||
        messageParams.correctiveRecodedCharset) {
      BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection(clearMisdetectionCorrectionParams);
    }
#ifdef DEBUG_onEverythingLoadedAndReady
    else {
      console.log('original message is known to have had no charset issues; avoiding charsetMisdetectionCorrection');
    }
#endif

    let isHTMLEditor = IsHTMLEditor();
    if (IsHTMLEditor) {
      BiDiMailUI.Composition.alternativeEnterBehavior = BiDiMailUI.Prefs.get("compose.alternative_enter_behavior", true);
      let  defaultToSendBothTextAndHTML = BiDiMailUI.Prefs.get("compose.default_to_send_text_with_html", false);

      var defaultOptionElementId = (defaultToSendBothTextAndHTML ? "format_both" : "format_html");
      document.getElementById(defaultOptionElementId).setAttribute("checked", "true");
      if (typeof OutputFormatMenuSelect == "function") {
        OutputFormatMenuSelect(
          {getAttribute: function () {
            return defaultOptionElementId;
          }} );
      } else {
        // OutputFormatMenuSelect function has been removed in 102.
        let prevSendFormat = gMsgCompose.compFields.deliveryFormat;
        switch (defaultOptionElementId) {
          case "format_html":
            newSendFormat = Ci.nsIMsgCompSendFormat.HTML;
            break;
          case "format_both":
            newSendFormat = Ci.nsIMsgCompSendFormat.Both;
            break;
        }
        gMsgCompose.compFields.deliveryFormat = newSendFormat;
        gContentChanged = prevSendFormat != newSendFormat;
      }
      BiDiMailUI.Composition.setParagraphMarginsRule();

      // Note that the "alternative Enter key behavior" is only
      // relevant to paragraph mode; we used to always try to set
      // paragraph mode to express that behavior, but several users
      // have been complaining...
      var startCompositionInParagraphMode = BiDiMailUI.Prefs.get("compose.start_composition_in_paragraph_mode", false);
      if (startCompositionInParagraphMode)
        BiDiMailUI.Composition.setParagraphMode("p");
      else
        BiDiMailUI.Composition.setParagraphMode("");
    }
    BiDiMailUI.Composition.setInitialDirection(messageParams);

#ifdef DEBUG_onEverythingLoadedAndReady
    console.log('isReply = ' + messageParams.isReply +
      '\ngMsgCompose.originalMsgURI = ' +
      (gMsgCompose? gMsgCompose.originalMsgURI : 'no gMsgCompose') +
      '\noriginalDisplayDirection = ' + messageParams.originalDisplayDirection +
      '\nUTF-8 recoded = ' + messageParams.correctiveRecodedUTF8 +
      '\ncharset recoded = ' + messageParams.correctiveRecodedCharset +
      '\nmailnews decoding type = ' + messageParams.mailnewsDecodingType +
      '\ncharset was forced = ' + messageParams.charsetWasForced
      );
#endif

    // Decide which direction switch item should appear in the context menu -
    // the switch for the whole document or for the current paragraph
    document.getElementById("contextSwitchParagraphDirectionItem")
      .hidden = !isHTMLEditor;
    document.getElementById("contextBodyDirectionItem")
      .hidden = isHTMLEditor;

    if (isHTMLEditor) {
      // Determine Enter key behavior
      BiDiMailUI.Composition.alternativeEnterBehavior =
        BiDiMailUI.Prefs.get("compose.alternative_enter_behavior", true);
      // Applying the alternative Enter behavior requires the editor to be
      // in paragraph mode; but we won't consider doing that until the body is
      // ready.
    }

    BiDiMailUI.Composition.directionSwitchController.setAllCasters();
  },

  msgComposeStateListener : {
    NotifyComposeBodyReady: function() {
#ifdef DEBUG_msgComposeStateListener
      console.log("In msgComposeStateListener.NotifyComposeBodyReady()");
#endif
      BiDiMailUI.Composition.lastWindowToHaveFocus = null;
      BiDiMailUI.Composition.onEverythingLoadedAndReady();
    }
  },

  onUnload : function() {
#ifdef DEBUG_onUnload
    console.log('in BiDiMailUI.Composition.onUnload()');
#endif
    // Stop tracking "Show Direction Buttons" pref.
    Services.prefs.removeObserver(
      BiDiMailUI.Composition.directionButtonsPrefListener.domain,
      BiDiMailUI.Composition.directionButtonsPrefListener
    );
  },

  onInit : function() {
#ifdef DEBUG_onInit
    console.log('in onInit');
#endif
    document.getElementById("msgcomposeWindow").removeEventListener("compose-window-init", BiDiMailUI.Composition.onInit);
    gMsgCompose.RegisterStateListener(BiDiMailUI.Composition.msgComposeStateListener);
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
    console.log('----- BiDiMailUI.Composition.applyDirectionSetterToSelectionBlockElements() -----');
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
          console.log(
            'endContainer:' + endContainer + "\ntype: " +
            endContainer.nodeType + "\nHTML:\n" + endContainer.innerHTML +
            "\nvalue:\n" + endContainer.nodeValue);
#endif

          var node = startContainer;
          // walk the tree till we find the endContainer of the selection range,
          // giving our directionality style to everything on our way
          do {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
            console.log(
              'visiting node:' + node + "\ntype: " + node.nodeType +
              "\nHTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue);
#endif

            var closestBlockElement = BiDiMailUI.Composition.findClosestBlockElement(node);
            if (closestBlockElement) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              console.log(
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
              console.log('could not find cbe');
#endif
              break;
            }

            // This check should be placed here, not as the 'while'
            // condition, to handle cases where begin == end
            if (node == endContainer) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              console.log('at end container, stopping traversal');
#endif
              break;
            }

            // Traverse the tree in order
            if (node.firstChild) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              console.log('descending to first child');
#endif
              node = node.firstChild;
            }
            else if (node.nextSibling) {
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
              console.log('moving to next sibling');
#endif
              node = node.nextSibling;
            }
            else {
              // find an ancestor which has anything else after our node
              while (node.parentNode != null) {
                node = node.parentNode;
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
                console.log('moved up to parent node');
#endif
                if (node.nextSibling) {
                  node = node.nextSibling;
#ifdef DEBUG_applyDirectionSetterToSelectionBlockElements
                  console.log('moved to next sibling');
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

  switchParagraphDirection : function() {
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
      console.log('key down    : Shift');
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)
      console.log('key down    : Ctrl');
    else console.log('key up      : Other');
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
    console.log('sequence vars: ' + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 ? 'T ' : 'F ') + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 ? 'T ' : 'F '));
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
      console.log('key up      : Shift');
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)
      console.log('key up      : Ctrl');
    else console.log('key up      : Other');
#endif

    if ((ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) ||
        (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)) {
      if (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 &&
          BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2) {
        if (IsHTMLEditor()) {
#ifdef DEBUG_keypress
    console.log('SWITCHING paragraph');
#endif
    BiDiMailUI.Composition.switchParagraphDirection();
        }
        else {
#ifdef DEBUG_keypress
          console.log('SWITCHING document');
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
    console.log('sequence vars: ' +
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
    if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) { console.log('key pressed : Shift'); }
    else if (ev.keyCode == BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode) { console.log('key pressed : Ctrl'); }
    else { console.log('key up      : Other'); }
#endif

    if ((ev.keyCode != BiDiMailUI.Composition.CtrlShiftMachine.ShiftKeyCode) &&
        (ev.keyCode != BiDiMailUI.Composition.CtrlShiftMachine.CtrlKeyCode)) {
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 = false;
      BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 = false;
    }

#ifdef DEBUG_keypress
    console.log(
      'sequence vars: ' + (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence1 ? 'T ' : 'F ') +
      (BiDiMailUI.Composition.CtrlShiftMachine.ctrlShiftSequence2 ? 'T ' : 'F '));
#endif

  },

  getParagraphMarginFromPrefs : function() {
    var basePrefName = "compose.space_between_paragraphs";
    var marginScale = BiDiMailUI.Prefs.get(basePrefName + ".scale", "cm");
    var marginVal;
    if (marginScale != "px") {
      marginVal =
        parseFloat(BiDiMailUI.Prefs.get(basePrefName + ".value", "0"), 10);
    }
    else {
      marginVal =
        parseInt(BiDiMailUI.Prefs.get(basePrefName + ".value", "0"), 10);
    }
    if (isNaN(marginVal))
      marginVal = "0";

    return (marginVal + marginScale);
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

  inSubjectBox_ : function()   {
    let subjectInputField = document.getElementById("msgSubject");
    return (document.commandDispatcher.focusedElement == subjectInputField);
  },

  isCommandEnabled: function(command) {
    var inMessage = (content == top.document.commandDispatcher.focusedWindow);
    var inSubjectBox = this.inSubjectBox_();
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
    console.log('isCommandEnabled for command "' + command + '". inMessage: ' + inMessage + ' , inSubjectBox = ' + inSubjectBox + ' , retVal = ' + retVal);
#endif


    return retVal;
  },

  setCasterGroup: function(casterPair,inMessage,inSubjectBox) {
#ifdef DEBUG_setCasterGroup
    console.log('setting caster group ' + casterPair);
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
            .getComputedStyle(BiDiMailUI.getMessageEditor(document).contentDocument.body, "").getPropertyValue("direction");
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
      console.log('setting casters.');
#endif
    var inMessage = (content == top.document.commandDispatcher.focusedWindow);
    var inSubjectBox = this.inSubjectBox_();
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
