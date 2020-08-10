var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

// Code outside BiDi Mail UI should only use the 
// BiDiMailUI.Display.ActionPhases and perhaps the
// BiDiMailUI.Display.setMessageDirectionForcing function
// (ActionPhase functions are the four phases of action 
// performed when loading a message)

BiDiMailUI.Display = {
  ActionPhases : {

    charsetMisdetectionCorrection : function(cMCParams) {
      if (!cMCParams.preferredCharset)
        BiDiMailUI.Display.populatePreferredCharset(cMCParams);
    
      if (!BiDiMailUI.Display.fixLoadedMessageCharsetIssues(cMCParams)) {
        // the message will be reloaded, let's not do anything else 
        return;
      }
       
      if (cMCParams.charsetOverrideInEffect) {
        cMCParams.body.setAttribute('bidimailui-charset-is-forced',true);
      }

#ifdef DEBUG_browserOnLoadHandler
      console.log("completed charset correction phase");
#endif

    },

    htmlNumericEntitiesDecoding : function(body) {
      if (BiDiMailUI.Prefs.getBoolPref("display.decode_numeric_html_entities", false)) {
        if (BiDiMailUI.Display.decodeNumericHTMLEntitiesInText(body)) {
          body.setAttribute('bidimailui-found-numeric-entities',true);
        }
      }
    },

    quoteBarsCSSFix : function(domDocument) {
      BiDiMailUI.Display.appendStyleSheet(domDocument, 'quotebar.css');
    },

    directionAutodetection : function(domDocument) {
      if (!BiDiMailUI.Prefs.getBoolPref("display.autodetect_direction", true))
        return;

      var body = domDocument.body;
      BiDiMailUI.Display.appendStyleSheet(domDocument, 'direction-autodetection.css');
      var detectedOverallDirection = BiDiMailUI.directionCheck(document, NodeFilter, body);
#ifdef DEBUG_directionAutodetection
      console.log("detected overall direction: " + detectedOverallDirection);
#endif
      body.setAttribute('bidimailui-direction-uniformity',detectedOverallDirection);
      if (detectedOverallDirection == "mixed") {
        // The message has both LTR and RTL content in the message,
        // so we'll break it up into smaller block elements whose direction
        // can be set separately and detect-and-set for each such element
        BiDiMailUI.Display.preprocessMessageDOM(body);
        BiDiMailUI.Display.detectDirections(body);
      }
      // If the body isn't mixed, the message is either neutral in 
      // direction, all-LTR or all-RTL, in all which cases it's enough 
      // that we set the direction for the entire body
      BiDiMailUI.Display.setDirections(body, null);
    }    
  },
  
  setMessageDirectionForcing : function(body,forcedDirection) {
    // we assume forcedDirection is 'rtl', 'ltr' or null
#ifdef DEBUG_setMessageDirectionForcing
    console.log('SetMessageDirection(' + forcedDirection + ')');
#endif
    BiDiMailUI.Display.setDirections(body,forcedDirection);
    if (!forcedDirection) {
      body.removeAttribute('bidimailui-forced-direction');
    }
    else {
      body.setAttribute('bidimailui-forced-direction',forcedDirection);
    }
  },


  appendStyleSheet : function(domDocument, sheetFileName) {
    let ns = domDocument.documentElement.lookupNamespaceURI("html");
    let element = window.document.createElementNS(ns, "link");
    element.setAttribute("rel", "stylesheet");
    element.setAttribute("href", 'chrome://bidimailui/content/' + sheetFileName);
    return domDocument.documentElement.appendChild(element);

/*    
    var head = domDocument.getElementsByTagName("head")[0];
    if (head) {
      var styleSheetLink = domDocument.createXULElement("link");
      styleSheetLink.rel  = "stylesheet";
      styleSheetLink.type = "text/css";
      styleSheetLink.href = 'chrome://bidimailui-for-message-html/content/' + sheetFileName;
      head.appendChild(styleSheetLink);
    }
*/
  },


  // Functions from here on should not be used by code outside this file
  // --------------------------------------------------------------------

  // split elements in the current message (we assume it's moz-text-plain)
  // so that \n\n in the message text means moving to another block element
  // this allows setting per-paragraph direction, assuming paragraphs are
  // separated by double \n's (with possibly some neutral characters between 
  // them, e.g. hello\n---\ngoodbye )

  populatePreferredCharset : function(cMCParams) {
    if (!BiDiMailUI.Prefs.getBoolPref(
        "display.autodetect_bidi_misdecoding", true)) {
      return;
    }
    var charsetPrefValue = BiDiMailUI.Prefs.getAppStringPref("mailnews.view_default_charset", null);

#ifdef DEBUG_charsetMisdetectionCorrectionPhase
    console.log("charsetPrefValue = " + charsetPrefValue);
#endif
        
    // if the charset pref is not one we can use for detecting mis-decoded
    // codepage charsets, maybe we should tell the user about it
      
    if ((charsetPrefValue != "ISO-8859-8-I") &&
        (charsetPrefValue != "ISO-8859-8") &&
        (charsetPrefValue != "ISO-8859-6") &&
        (charsetPrefValue != "windows-1255") &&
        (charsetPrefValue != "windows-1256")) {
       if (BiDiMailUI.Prefs.getBoolPref(
           "display.user_accepts_unusable_charset_pref", false)) {
         cMCParams.preferredCharset = null;
         return;
       }
       else cMCParams.preferredCharset =
         cMCParams.unusableCharsetHandler();
    }
    else cMCParams.preferredCharset = charsetPrefValue;

    // for our purposes at the moment, we 'prefer' windows-1255/6 over
    // the ISO single-byte charsets

    if ((cMCParams.preferredCharset == "windows-1255") ||
        (cMCParams.preferredCharset == "ISO-8859-8-I") ||
        (cMCParams.preferredCharset == "ISO-8859-8")) {
        cMCParams.preferredCharset = "windows-1255";
    }
    if ((cMCParams.preferredCharset == "windows-1256") ||
        (cMCParams.preferredCharset == "ISO-8859-6")) {
        cMCParams.preferredCharset = "windows-1256";
    }
   
    // If the user's preferred charset is not set to one of windows-1255/6 or
    // equivalents, we will completely ignore what may me misdecoded text
    // in those codepages - we won't try to recover it in any way (but we 
    // will try to recover UTF-8 text)

    if ((cMCParams.preferredCharset != "windows-1255") &&
        (cMCParams.preferredCharset != "windows-1256")) {
      cMCParams.preferredCharset = null;
    }
  },


  splitTextElementsInPlainMessageDOMTree : function(subBody) {
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
    console.log("in BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree()");
#endif
    var treeWalker = document.createTreeWalker(
      subBody,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    var node = treeWalker.nextNode();
    while (node) {
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
      console.log("-----\ntext node\n-----\n" + node.nodeValue);
#endif
      // TODO: ensure the parent's a PRE or BLOCKQUOTE or something else that's nice
      let textSplit = new RegExp (BiDiMailUI.RegExpStrings.TEXT_SPLIT_SEQUENCE, "m");

      if (! textSplit.test(node.nodeValue)) {
         node = treeWalker.nextNode();
         continue;
      }
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
      console.log(RegExp.leftContext + "\n-----\n"+RegExp.lastMatch+"\n-----\n"+RegExp.rightContext);
#endif

      var restOfText = node.cloneNode(false);
      node.nodeValue = RegExp.leftContext + RegExp.lastMatch;
      restOfText.nodeValue = RegExp.rightContext;
    
      var firstPartOfParent = node.parentNode;
      var secondPartOfParent = node.parentNode.cloneNode(false);

      secondPartOfParent.appendChild(restOfText);
       
      // everything after our node with the \n\n goes to the splinter element,
      // everything before it remains
      while (node.nextSibling) {
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
//    console.log("nextsibling =\n" + node.nextSibling + "\nvalue:\n"+(node.nextSibling ? node.nextSibling.nodeValue : null));
#endif
        var tempNode = node.nextSibling;
        firstPartOfParent.removeChild(node.nextSibling);
        secondPartOfParent.appendChild(tempNode);
      }
       
      // add the new part of the parent to the document
      if (firstPartOfParent.nextSibling)
        firstPartOfParent.parentNode.insertBefore(secondPartOfParent,firstPartOfParent.nextSibling);
      else firstPartOfParent.parentNode.appendChild(secondPartOfParent);

      var newNode = treeWalker.nextNode();
      node = ((newNode != node) ? newNode : treeWalker.nextNode());
    }
  },

  // wraps every sequence of text node, A's etc in a
  // moz-text-flowed message's DOM tree within a DIV
  // (whose direction we can later set)
  wrapTextNodesInFlowedMessageDOMTree : function(subBody) {
    var clonedDiv = subBody.ownerDocument.createXULElement("DIV");
    clonedDiv.setAttribute('bidimailui-generated', true);
    var treeWalker = document.createTreeWalker(
      subBody,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    var node;
    while ((node = treeWalker.nextNode())) {
      if ((node.parentNode.nodeName != 'A') &&
          (node.parentNode.nodeName != 'DIV') &&
          (node.parentNode.nodeName != 'BLOCKQUOTE')) {
        // and other such elements within moz-text-flowed messages
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
        console.log("not handling node\n" + node.nodeValue + "\nwith parent node name " + node.parentNode.nodeName);
#endif
        continue;
      }
      if (node.parentNode.hasAttribute('bidimailui-generated') ||
          ((node.parentNode.nodeName == 'A') &&
          (node.parentNode.parentNode.hasAttribute('bidimailui-generated')))) {
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
        console.log("already handled node\n"+ node.nodeValue);
#endif
        continue;
      }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
      console.log("wrapping with DIV, node\n" + node.nodeValue);
#endif
      var wrapperDiv = clonedDiv.cloneNode(false);

      var emptyLine;
      if (node.parentNode.nodeName == 'A') {
        node.parentNode.parentNode.replaceChild(wrapperDiv,node.parentNode);
        wrapperDiv.appendChild(node.parentNode);
        emptyLine = false;
      }
      else {
        node.parentNode.replaceChild(wrapperDiv,node);
        wrapperDiv.appendChild(node);
        emptyLine =
          // actually we only see '\n' text nodes for empty lines, but let's add
          // some other options as a safety precaution
          ((node.nodeValue == '\n') ||
           !node.nodeValue );
      }
      var sibling;
      // add everything within the current 'paragraph' to the new DIV
      while (wrapperDiv.nextSibling) {
        sibling = wrapperDiv.nextSibling
        if (sibling.nodeName == 'BLOCKQUOTE') {
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
          console.log("hit blockquote, finishing walk");
#endif
          break;
        }
        if (sibling.nodeName == 'BR') {
          if (!emptyLine) {
            // if the DIV has any text content, it will
            // have a one-line height; otherwise it will 
            // have no height and we need the BR after it
            wrapperDiv.parentNode.removeChild(sibling);
          }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
            console.log("hit BR with emptyLine = " + emptyLine + "\nfinishing walk");
#endif
          break;
        }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
        console.log("adding node " + sibling + " to DIV\nnode name:" + node.nodeName + "\nnode value\n" + node.nodeValue);
#endif
        wrapperDiv.parentNode.removeChild(sibling);
        wrapperDiv.appendChild(sibling);
        // we're assuming empty lines in moz-text-flowed messages
        // can only be one empty text node followed by a BR; and
        // if we got here, we haven't hit BR right after the first
        // text node
        emptyLine = false;
      }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
      if (!sibling)
        console.log("walk ends after last sibling!");
#endif
    }
  },

  preprocessMessageDOM : function(body) {
#ifdef DEBUG_preprocessMessageDOM
    console.log("BiDiMailUI.Display.preprocessMessageDOM");
    if (body.childNodes.item(1))
      console.log("body.childNodes.item(1).className = " + body.childNodes.item(1).className);
    else
      console.log("body has no children");
#endif

    for (let i=0; i < body.childNodes.length; i++) {
      var subBody = body.childNodes.item(i);

#ifdef DEBUG_preprocessMessageDOM
      console.log('subbody ' + i + ' is ' + subBody.className);
#endif

      if (subBody.className == "moz-text-plain") {
        BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree(subBody);
      }
      else if (subBody.className == "moz-text-flowed") {
        BiDiMailUI.Display.wrapTextNodesInFlowedMessageDOMTree(subBody);
      }
    }
  },

// Gather all the elements whose contents' direction 
// we need to check and whose direction we set accordingly
// (or force, as the case may be)
  gatherElementsRequiringDirectionSetting : function(
    body, elementsRequiringExplicitDirection) {
    for (let i=0; i < body.childNodes.length; i++) {
      var subBody = body.childNodes.item(i);

      // Not touching elements which aren't moz-text-something,
      // as we don't know what to do with them
      if (! /^moz-text/.test(subBody.className))
        continue;
      
      elementsRequiringExplicitDirection.push(subBody);

#ifdef DEBUG_gatherElementsRequiringDirectionSetting
      console.log('subbody ' + i + ' is ' + subBody.className);
#endif

      var tagNames = {
      	"moz-text-plain"   :"pre, blockquote",
      	"moz-text-flowed"  :"div, blockquote",
      	"moz-text-html"    :"div, table, blockquote"};

        // On older JS engines you would need to use getElementsByTagName("TAG") for each tag
      var nodes =  subBody.querySelectorAll(tagNames[subBody.className]);
      for (let j = 0; j < nodes.length; j++ ) {
        // In flowed messages, not touching elements which aren't moz-text-something,
        // as we don't know what to do with them
        if (subBody.className == "moz-text-flowed" && /^moz-text/.test(nodes[j].className))
          continue;
        elementsRequiringExplicitDirection.push(nodes[j]);
      }
    }
  },

  detectDirections : function(body) {
#ifdef DEBUG_detectAndSetDirections
    console.log(
      "in detectAndSetDirections for message\n" + gFolderDisplay.selectedMessageUris[0]);
#endif
    
    var elementsRequiringExplicitDirection = new Array;
    BiDiMailUI.Display.gatherElementsRequiringDirectionSetting(
      body, elementsRequiringExplicitDirection);

#ifdef DEBUG_detectAndSetDirections
    console.log("elementsRequiringExplicitDirection.length = " + elementsRequiringExplicitDirection.length);
#endif

    // direction-check all of the elements whose direction should be set explicitly

    for (let i=0; i < elementsRequiringExplicitDirection.length; i++) {
      var node = elementsRequiringExplicitDirection[i];
      try {
     
#ifdef DEBUG_detectAndSetDirections
        console.log('elementsRequiringExplicitDirection[ ' + i + ']: ' + node + "\ntype: " + node.nodeType + "\nclassName: " + node.className + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
          
        var detectedDirection = BiDiMailUI.directionCheck(document, NodeFilter, node);
#ifdef DEBUG_detectAndSetDirections
        console.log("detected direction: " + detectedDirection);
#endif
        node.setAttribute('bidimailui-direction-uniformity',detectedDirection);
      } catch(ex) {
#ifdef DEBUG_detectAndSetDirections
        console.log(ex);
#endif
      }
    }
  },

  setDirections : function(body, forcedDirection) {
    // Our logic is currently as follows:
    //
    // - Forcing LTR or RTL behaves the same way regardless of whether we have
    //   autodetect preffed on or off: We set a style rule for the body element
    //   (so if other elements have specific definition we don't interfere; perhaps
    //   we should?)
    // - If autodetect is preffed off, forcedDirection null means using the original
    //   directions, by restoring the body's original CSS direction property (usually
    //   none).
    // - If autodetect is preffed on, forcedDirection null means setting the body
    //   parent's class so that all elements under it (including the body) behave
    //   according to the rules for the classes assigned to them by the autodetection.
    //
    //   Note that in all 3 cases, the document's own style rules may prevail
    //   over anything we have set. We consider this to be appropriate.


#ifdef DEBUG_setDirections
    console.log(
      'settings directions to ' + 
      (forcedDirection ? forcedDirection :
       'detected/original directions'));
#endif

    switch(forcedDirection) {
      case 'ltr': 
      case 'rtl': 
        try {
          body.parentNode.classList.remove('bidimailui-use-detected-directions');
        } catch(ex) {
          // this is an old build, no classList... bummer;
          // let's remove manually from the list of class names
          var re = / *bidimailui-use-detected-directions */;
          if (re.test(body.parentNode.className)) {
            body.parentNode.className = RegExp.leftContext + 
              ((re.rightContext == '') ? ' ' : '') +  RegExp.rightContext;
          }
        }
        if (!body.hasAttribute('bidimailui-original-direction')) {
          body.setAttribute('bidimailui-original-direction',
            body.style.direction);
        }
        body.style.direction = forcedDirection;
        break;
      default:
        var originalBodyCSSDirectionProperty =
          body.getAttribute('bidimailui-original-direction');
        if (originalBodyCSSDirectionProperty &&
            (originalBodyCSSDirectionProperty != "") ) {
          body.style.direction = originalBodyCSSDirectionProperty;
        }
        else {
          body.style.removeProperty('direction');
        }
        try {
          body.parentNode.classList.add('bidimailui-use-detected-directions');
        } catch(ex) {
          // this is an old build, no classList... bummer;
          // let's add manually to the list of class names
          if (body.parentNode.className.indexOf('bidimailui-use-detected-directions') == -1) {
            body.parentNode.className += 
              ((body.parentNode.className != "") ? ' ' : '') +
              'bidimailui-use-detected-directions';
          }
        }
    }
  },


  // Detect and attempt to reload/recode content of wholly or partially 
  // mis-decoded messages
  //
  // Notes: 
  //   When returning, cMCParams.needCharsetForcing indicates
  //   whether a reload is necessary
  //
  //   This function assumes the preferred charset is either windows-1255,
  //   windows-1256 or null; see populatePreferredCharset().
  //
  fixLoadedMessageCharsetIssues : function(cMCParams) {

    var contentToMatch;
    
    // TODO: perhaps we should prefer the undecoded MIME subject over
    // the decoded one - and decode it ourselves with the charset
    // to our liking?
    if (!cMCParams.messageSubject && cMCParams.messageHeader) {
      cMCParams.messageSubject =
        cMCParams.messageHeader.mime2DecodedSubject;
    }

#ifdef DEBUG_fixLoadedMessageCharsetIssues
    console.log('in BiDiMailUI.Display.fixLoadedMessageCharsetIssues()');
#endif

    /*
    There are 4 parameters affecting what we need to do with the loaded message
    with respect to reloading or recoding.
    
    1. Message has been reloaded (by the previous run of this function) or has
       otherwise been forced into a specific charset (Y/N)
    2. Charset used by mozilla to decode the message (
         N = windows-1252/equivalents, including no/empty charset
         C = windows-1255/6
         U = UTF-8, 
       we won't handle any issues with other charsets
    3. Message contains windows-1255/6 text (Y/N)
    4. Message contains UTF-8 text (that is, UTF-8 octet sequences 
       which are not iso-8859-1 chars 0-127) (Y/N)

    What should we do for each combination of values? 
    (* means all possible values)

    *NNN - No problem, do nothing 
    NNNY - Reload with UTF-8 (and continue with YUNY)
    NNYN - Reload with windows-1255/6  (and continue with YCYN)
    *NYY - Recode both UTF-8 and windows-1255/6
    *CNN - No problem, do nothing
    NCNY - Reload with UTF-8 (and continue with YUNY)
    *CYN - No problem, do nothing
    NCYY - This is bad, since we can't effectively recode; strangely enough, the
           best bet should be reloading with windows-1252 (and continue
           with one of YNNN-YNYY)
    *UN* - No problem, do nothing
    NUYN - Reload with windows-1255/6
    NUYY - This is bad, since we can't effectively recode; strangely enough, the
           best bet should be reloading with windows-1252 (and continue
           with one of YNNN-YNYY)
    YNNY - recode UTF-8 text
    YNYN - recode windows-1255/6 text
    YC*Y - This is very bad, since we're not allowed to change charset;
           we'll try recoding UTF-8 text, but it probably won't work well
    *UY* - This is very bad, since we're not allowed to change charset;
           we'll try recoding windows-1255/6 text, but it probably won't work well
           
    Extra Notes:

    - If we tell the app to change the charset, the message will be reloaded and
      this function will be triggered again
    - There's 'waste' in this algorithm - after recoding, we again check for UTF-8
      and windows-1255/6 text although we sometimes know the answer; but how to safely
      convey this information to the next load event? Using a global variable may be
      unsafe
    */
    
    // This sets parameter no. 1
    var mustKeepCharset = 
      cMCParams.dontReload ||
      cMCParams.charsetOverrideInEffect;

    // This sets parameter no. 2
#ifdef DEBUG_fixLoadedMessageCharsetIssues
    console.log('current charset used for decoding:\n' + cMCParams.currentCharset);
#endif
    if ((cMCParams.preferredCharset != null) &&
        (cMCParams.currentCharset == cMCParams.preferredCharset))
      cMCParams.mailnewsDecodingType = "preferred-charset";
    else if ((((cMCParams.currentCharset == "ISO-8859-8-I") ||
               (cMCParams.currentCharset == "ISO-8859-8")) && 
              (cMCParams.preferredCharset == "windows-1255") ) ||
             ((cMCParams.currentCharset == "ISO-8859-6") && 
              (cMCParams.preferredCharset == "windows-1255") ) ) {
      cMCParams.mailnewsDecodingType = "preferred-charset";
    }
    else switch(cMCParams.currentCharset) {
      case "US-ASCII":
      case "ISO-8859-1":
      case "windows-1252":
      case null:
        cMCParams.mailnewsDecodingType = "latin-charset"; break;
      case "":
        // sometimes the charset is misread, and Mozilla sets it to "" while
        // using UTF-8; this is the case specifically for
        // Content-type: text/plain; charset=iso-8859-I
        // in the message... but we can't know that without streaming the raw
        // message, which is expensive
      case "UTF-8":
        cMCParams.mailnewsDecodingType = "UTF-8"; break;
      default: 
#ifdef DEBUG_fixLoadedMessageCharsetIssues
    console.log(
      'returning since cMCParams.currentCharset = ' 
      + cMCParams.currentCharset);
#endif
        return true;
    }
    cMCParams.body.setAttribute('bidimailui-detected-decoding-type',cMCParams.mailnewsDecodingType);


    // This sets parameter no. 3 
    // (note its value depends on parameter no. 2)
    var havePreferredCharsetText;

    if (cMCParams.preferredCharset != null) {
      if (cMCParams.mailnewsDecodingType == "preferred-charset") {
        // text in the preferred charset is properly decoded, so we only
        // need to look for characters in the Hebrew or Arabic Unicode ranges;
        // we look for a sequence, since some odd character may be the result
        // of misdecoding UTF-8 text
        contentToMatch = new RegExp(
          (cMCParams.preferredCharset == "windows-1255") ?
          "[\\u0590-\\u05FF\\uFB1D-\\uFB4F]{3,}" : "[\\u0600-\\u06FF\\uFE50-\\uFEFC]{3,}");
      }
      else {
        // text in the preferred charset is properly decoded, so we only
        // need to look for a character in the Hebrew or Arabic Unicode range
        contentToMatch = new RegExp(
          (cMCParams.mailnewsDecodingType == "latin-charset") ?
          // Here we want a sequence of Unicode values of characters whose 
          // windows-1252 octet is such that would be decoded as 'clearly'
          // Hebrew or Arabic text; we could be less or more picky depending
          // on what we feel about characters like power-of-2, paragraph-mark,
          // plus-minus etc. ; let's be conservative: the windows-1255
          // and windows-1256 octet ranges corresponding to the letters 
          // themselves fall within the range C0-FF; this range is all accented
          // Latin letters in windows-1252, whose Unicode values are the
          // same as their octets
          "[\\u00C0-\\u00FF]{3,}" :
          // Here we know that cMCParams.mailnewsDecodingType == "UTF-8"; if
          // you decode windows-1255/6 content as UTF-8, you'll get failures
          // because you see multi-octet-starter octets (11xxxxxx) followed
          // by other multi-octet-starter octets rather than 
          // multi-octect-continuer octets (10xxxxxx); what mailnews does in
          // such cases is emit \uFFFD, which is the Unicode 'replacement
          // character'; let's be cautious, though, and look for repetitions
          // of this rather than the odd encoding error or what-not
          "\\uFFFD{3,}");
      }    
      havePreferredCharsetText = 
        BiDiMailUI.matchInText(document, NodeFilter, cMCParams.body, contentToMatch) ||
        contentToMatch.test(cMCParams.messageSubject);
    }
    else {
      havePreferredCharsetText = false;
    }
    
    // This sets parameter no. 4
    // (note its value depends on parameter no. 2)
    var haveUTF8Text;
    
    contentToMatch = new RegExp (
      (cMCParams.mailnewsDecodingType == "UTF-8") ?
      // The only characters we can be sure will be properly decoded in windows-1252
      // when they appear after UTF-8 decoding are those with single octets in UTF-8
      // and the same value as windows-1252; if there's anything else we'll be
      // conservative and assume some UTF-8 decoding is necessary
      "[^\\u0000-\\u007F\\u00A0-\\u00FF]" :
      // cMCParams.mailnewsDecodingType is latin-charset or preferred-charset
      //
      // TODO: some of these are only relevant for UTF-8 misdecoded as windows-1252 
      // (or iso-8859-1; mozilla cheats and uses windows-1252), 
      //
      BiDiMailUI.RegExpStrings.MISDETECTED_UTF8_SEQUENCE);

    haveUTF8Text = 
      BiDiMailUI.matchInText(document, NodeFilter, cMCParams.body, contentToMatch) ||
      contentToMatch.test(cMCParams.messageSubject);

#ifdef DEBUG_fixLoadedMessageCharsetIssues
    console.log("--------\n " +
      (mustKeepCharset ? "Y" : "N") +
      ((cMCParams.mailnewsDecodingType == "latin-charset") ? "N" :
       ((cMCParams.mailnewsDecodingType == "preferred-charset") ? "C" : "U")) +
      (havePreferredCharsetText ? "Y" : "N") +
      (haveUTF8Text ? "Y" : "N") + 
      "\n--------");
#endif

    // ... and now act based on the parameter values
    
    if (!mustKeepCharset) {
      switch(cMCParams.mailnewsDecodingType) {
        case "latin-charset":
          if (!havePreferredCharsetText) {
            if (!haveUTF8Text) {
              // NNNN
            }
            else {
              // NNNY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset UTF-8");
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = "utf-8";
              return;
            }
          }
          else {
            if (!haveUTF8Text) {
              //NNYN 
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset " + cMCParams.preferredCharset);
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = cMCParams.preferredCharset;
              return false;
            }
            else {
              //NNYY
              cMCParams.recodeUTF8 = true;
              cMCParams.recodePreferredCharset = true;
              // but note we might still need to force the charset!
            }
          }
          break;
        case "preferred-charset":
          if (!havePreferredCharsetText) {
            if (!haveUTF8Text) {
              // NCNN
            }
            else {
              // NCNY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset UTF-8");
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = "utf-8";
              return;
            }
          }
          else {
            if (!haveUTF8Text) {
              // NCYN
            }
            else {
              // NCYY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset windows-1252");
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = "windows-1252";
              return;
            }
          }
          break;
        case "UTF-8":
          if (!havePreferredCharsetText) {
            if (!haveUTF8Text) {
              // NUNN
            }
            else {
              // NUNY
            }
          }
          else {
            if (!haveUTF8Text) {
              // NUYN
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset " + cMCParams.preferredCharset);
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = cMCParams.preferredCharset;
              return;
            }
            else {
              // NUYY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              console.log("Forcing charset windows-1252");
#endif
              cMCParams.needCharsetForcing = true;
              cMCParams.charsetToForce = "windows-1252";
              return;
            }
          }
      }
    }
    else { // mustKeepCharset
      switch(cMCParams.mailnewsDecodingType) {
        case "latin-charset":
          // YNNN, YNNY, YNYN, YNYY
          cMCParams.recodePreferredCharset = havePreferredCharsetText;
          cMCParams.recodeUTF8 = haveUTF8Text;
          break;
        case "preferred-charset":
          // YCNN, YCNY, YCYN, YCYY
          cMCParams.recodePreferredCharset = false;
          cMCParams.recodeUTF8 = haveUTF8Text;
          break;
        case "UTF-8":
          // YUNN, YUNY, YUYN, YUYY
          cMCParams.recodePreferredCharset = havePreferredCharsetText;
          cMCParams.recodeUTF8 = false;
      }
    }

    // workaround for bug 23322:
    // Mozilla may be 'cheating' w.r.t. decoding charset
    if (!cMCParams.needCharsetForcing) {
      contentToMatch = new RegExp (
        BiDiMailUI.RegExpStrings.BOTCHED_UTF8_DECODING_SEQUENCE);
      if (BiDiMailUI.matchInText(document, NodeFilter, cMCParams.body, contentToMatch) ||
          contentToMatch.test(cMCParams.messageSubject)) {
#ifdef DEBUG_fixLoadedMessageCharsetIssues
          console.log(
            "found a long FFFD sequence (see bug 23322)");
#endif
        if (mustKeepCharset) {
#ifdef DEBUG_fixLoadedMessageCharsetIssues
          console.log(
            "...but we're not allowed to reload!");
#endif
        }
        else {
          cMCParams.needCharsetForcing = true;
          // let's be on the safe side
          cMCParams.charsetToForce = "windows-1252";
          return;
        }
      }
    }

    // at this point we _believe_ there's no need for charset forcing,
    // and we'll only perform corrective recoding
    if (cMCParams.recodeUTF8 || cMCParams.recodePreferredCharset) {
      BiDiMailUI.performCorrectiveRecoding(document, NodeFilter, cMCParams);
      // it may be the case that the corrective recoding suggests we need to force
      // the charset even though we've already done so; currently this is only
      // possible in the situation of bug 18707
      if (!mustKeepCharset && cMCParams.needCharsetForcing) {
        cMCParams.charsetToForce = cMCParams.currentCharset;
#ifdef DEBUG_fixLoadedMessageCharsetIssues
        // need to re-apply the same charset, as a workaround for a weird mailnews bug;
        // see https://www.mozdev.org/bugs/show_bug.cgi?id=18707
        console.log(
          "re-applying charset - bug 18707 workaround");
#endif
      }
    }
    return;
  },

// returns true if numeric entities were found
  decodeNumericHTMLEntitiesInText : function(element) {
    var entitiesFound = false;
    var treeWalker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null, // additional filter function
      false
    );
    var node;
    while((node = treeWalker.nextNode()) != null) {
      node.data = node.data.replace(
        /&#(\d+);/g,
        function() {
          entitiesFound = true;
          return String.fromCharCode(RegExp.$1);
        }
      );
    }
    return entitiesFound;
  }
}

