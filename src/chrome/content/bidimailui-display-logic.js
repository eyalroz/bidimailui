var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

// Code outside BiDi Mail UI should only use the
// BiDiMailUI.Display.ActionPhases and perhaps the
// BiDiMailUI.Display.setMessageDirectionForcing function
// (ActionPhase functions are the four phases of action
// performed when loading a message)

BiDiMailUI.Display = {};

BiDiMailUI.Display.ActionPhases = {};

BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection = function (cMCParams) {
  if (typeof cMCParams.preferredCharset == "undefined") {
    BiDiMailUI.Display.populatePreferredCharset(cMCParams);
    if (cMCParams.preferredCharset == null) {
      if (!BiDiMailUI.Prefs.get("display.user_forgoes_preferred_single_byte_charset")) {
        BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset();
      }
    }
  }

  if (!BiDiMailUI.Display.fixLoadedMessageCharsetIssues(cMCParams)) {
    // the message will be reloaded, let's not do anything else
    return;
  }

  if (cMCParams.charsetOverrideInEffect) {
    cMCParams.body.setAttribute('bidimailui-charset-is-forced', true);
  }
};

BiDiMailUI.Display.ActionPhases.htmlNumericEntitiesDecoding = function (body) {
  if (BiDiMailUI.Prefs.get("display.decode_numeric_html_entities", false)) {
    if (BiDiMailUI.Display.decodeNumericHTMLEntitiesInText(body)) {
      body.setAttribute('bidimailui-found-numeric-entities', true);
    }
  }
};

BiDiMailUI.Display.ActionPhases.quoteBarsCSSFix = function (domDocument) {
  BiDiMailUI.Display.linkStylesheet(domDocument, 'bidimailui-quotebar-css', 'quotebar.css');
};

BiDiMailUI.Display.ActionPhases.directionAutodetection = function (domDocument) {
  if (!BiDiMailUI.Prefs.get("display.autodetect_direction", true)) return;

  const body = domDocument.body;
  BiDiMailUI.Display.linkStylesheet(domDocument, 'bidimailui-direction-autodetection-css', 'direction-autodetection.css');

  const detectedOverallDirection = BiDiMailUI.directionCheck(document, NodeFilter, body);
  body.setAttribute('bidimailui-direction-uniformity', detectedOverallDirection);
  if (detectedOverallDirection === "mixed") {
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
};

BiDiMailUI.Display.setMessageDirectionForcing = function (body, forcedDirection) {
  // we assume forcedDirection is 'rtl', 'ltr' or null
  BiDiMailUI.Display.setDirections(body, forcedDirection);
  if (!forcedDirection) {
    body.removeAttribute('bidimailui-forced-direction');
  } else {
    body.setAttribute('bidimailui-forced-direction', forcedDirection);
  }
};


BiDiMailUI.Display.linkStylesheet = function (domDocument, linkId, sheetFileName) {
  if (domDocument.getElementById(linkId) != null) return;
  let sheetURI = `resource://bidimailui/content/${sheetFileName}`;
  let element = domDocument.createElement("link");
// If you use an HTML element - the link is ignored when computing style! :-(
//    let ns = domDocument.lookupNamespaceURI("html");
//    let element = domDocument.createElementNS(ns, "link");
  element.setAttribute("rel", "stylesheet");
  element.setAttribute("type", "text/css");
  element.setAttribute("id", linkId);
  element.setAttribute("href", sheetURI);
  domDocument.head.appendChild(element);
};

// Functions from here on should not be used by code outside this file
// --------------------------------------------------------------------


BiDiMailUI.Display.canonicalizePreferredCharset = function (charset) {
  switch (charset) {
  case "windows-1255":
  case "ISO-8859-8-I":
  case "ISO-8859-8":
    return "windows-1255";
  case "windows-1256":
  case "ISO-8859-6":
    return "windows-1256";
  }
  return null; // Should we support no preference again?
};

BiDiMailUI.Display.populatePreferredCharset = function (cMCParams) {
  // TODO: Should I cache these pref values somehow?
  let charsetPrefValue = BiDiMailUI.Prefs.get("display.preferred_single_byte_charset", null);
  cMCParams.preferredCharset = BiDiMailUI.Display.canonicalizePreferredCharset(charsetPrefValue);
};


// split elements in the current message (we assume it's moz-text-plain)
// so that \n\n in the message text means moving to another block element
// this allows setting per-paragraph direction, assuming paragraphs are
// separated by double \n's (with possibly some neutral characters between
// them, e.g. hello\n---\ngoodbye )
BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree = function (subBody) {
  const treeWalker = document.createTreeWalker(
    subBody,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node = treeWalker.nextNode();
  while (node) {
    // TODO: ensure the parent's a PRE or BLOCKQUOTE or something else that's nice
    let textSplit = new RegExp(BiDiMailUI.RegExpStrings.TEXT_SPLIT_SEQUENCE, "m");

    if (!textSplit.test(node.nodeValue)) {
      node = treeWalker.nextNode();
      continue;
    }
    const restOfText = node.cloneNode(false);
    node.nodeValue = RegExp.leftContext + RegExp.lastMatch;
    restOfText.nodeValue = RegExp.rightContext;

    const firstPartOfParent = node.parentNode;
    const secondPartOfParent = node.parentNode.cloneNode(false);

    secondPartOfParent.appendChild(restOfText);

    // everything after our node with the \n\n goes to the splinter element,
    // everything before it remains
    while (node.nextSibling) {
      const tempNode = node.nextSibling;
      firstPartOfParent.removeChild(node.nextSibling);
      secondPartOfParent.appendChild(tempNode);
    }

    // add the new part of the parent to the document
    if (firstPartOfParent.nextSibling) {
      firstPartOfParent.parentNode.insertBefore(secondPartOfParent, firstPartOfParent.nextSibling);
    } else firstPartOfParent.parentNode.appendChild(secondPartOfParent);

    const newNode = treeWalker.nextNode();
    node = ((newNode !== node) ? newNode : treeWalker.nextNode());
  }
};

// wraps every sequence of text node, A's etc in a
// moz-text-flowed message's DOM tree within a DIV
// (whose direction we can later set)
BiDiMailUI.Display.wrapTextNodesInFlowedMessageDOMTree = function (subBody) {
  let ns = subBody.ownerDocument.documentElement.lookupNamespaceURI("html");
  let clonedDiv = subBody.ownerDocument.createElementNS(ns, "div");
  clonedDiv.setAttribute('bidimailui-generated', true);
  const treeWalker = document.createTreeWalker(
    subBody,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while ((node = treeWalker.nextNode())) {
    if ((node.parentNode.nodeName.toLowerCase() !== 'a') &&
        (node.parentNode.nodeName.toLowerCase() !== 'div') &&
        (node.parentNode.nodeName.toLowerCase() !== 'blockquote')) {
      // and other such elements within moz-text-flowed messages
      continue;
    }
    if (node.parentNode.hasAttribute('bidimailui-generated') ||
        ((node.parentNode.nodeName.toLowerCase() === 'A') &&
        (node.parentNode.parentNode.hasAttribute('bidimailui-generated')))) {
      continue;
    }
    const wrapperDiv = clonedDiv.cloneNode(false);

    let emptyLine;
    if (node.parentNode.nodeName.toLowerCase() === 'a') {
      node.parentNode.parentNode.replaceChild(wrapperDiv, node.parentNode);
      wrapperDiv.appendChild(node.parentNode);
      emptyLine = false;
    } else {
      node.parentNode.replaceChild(wrapperDiv, node);
      wrapperDiv.appendChild(node);
      emptyLine =
        // actually we only see '\n' text nodes for empty lines, but let's add
        // some other options as a safety precaution
        ((node.nodeValue === '\n') ||
         !node.nodeValue);
    }
    let sibling;
    // add everything within the current 'paragraph' to the new DIV
    while (wrapperDiv.nextSibling) {
      sibling = wrapperDiv.nextSibling;
      if (sibling.nodeName.toLowerCase() === 'blockquote') {
        break;
      }
      if (sibling.nodeName.toLowerCase() === 'br') {
        if (!emptyLine) {
          // if the DIV has any text content, it will
          // have a one-line height; otherwise it will
          // have no height and we need the BR after it
          wrapperDiv.parentNode.removeChild(sibling);
        }
        break;
      }
      wrapperDiv.parentNode.removeChild(sibling);
      wrapperDiv.appendChild(sibling);
      // we're assuming empty lines in moz-text-flowed messages
      // can only be one empty text node followed by a BR; and
      // if we got here, we haven't hit BR right after the first
      // text node
      emptyLine = false;
    }
  }
};

BiDiMailUI.Display.preprocessMessageDOM = function (body) {
  for (let i = 0; i < body.childNodes.length; i++) {
    const subBody = body.childNodes.item(i);

    if (subBody.className === "moz-text-plain") {
      BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree(subBody);
    } else if (subBody.className === "moz-text-flowed") {
      BiDiMailUI.Display.wrapTextNodesInFlowedMessageDOMTree(subBody);
    }
  }
};

// Gather all the elements whose contents' direction
// we need to check and whose direction we set accordingly
// (or force, as the case may be)
BiDiMailUI.Display.gatherElementsRequiringDirectionSetting = function (body, elementsRequiringExplicitDirection) {
  for (let i = 0; i < body.childNodes.length; i++) {
    const subBody = body.childNodes.item(i);

    // Not touching elements which aren't moz-text-something,
    // as we don't know what to do with them
    if (!/^moz-text/.test(subBody.className)) continue;

    elementsRequiringExplicitDirection.push(subBody);

    const tagNames = {
      "moz-text-plain"   : "pre, blockquote",
      "moz-text-flowed"  : "div, blockquote",
      "moz-text-html"    : "div, table, blockquote"
    };

      // On older JS engines you would need to use getElementsByTagName("TAG") for each tag
    const nodes =  subBody.querySelectorAll(tagNames[subBody.className]);
    for (let j = 0; j < nodes.length; j++) {
      // In flowed messages, not touching elements which aren't moz-text-something,
      // as we don't know what to do with them
      if (subBody.className === "moz-text-flowed" && /^moz-text/.test(nodes[j].className)) continue;
      elementsRequiringExplicitDirection.push(nodes[j]);
    }
  }
};

BiDiMailUI.Display.detectDirections = function (body) {
  const elementsRequiringExplicitDirection = [];
  BiDiMailUI.Display.gatherElementsRequiringDirectionSetting(
    body, elementsRequiringExplicitDirection);

  // direction-check all of the elements whose direction should be set explicitly

  for (let i = 0; i < elementsRequiringExplicitDirection.length; i++) {
    let node = elementsRequiringExplicitDirection[i];
    try {
      const detectedDirection = BiDiMailUI.directionCheck(document, NodeFilter, node);
      node.setAttribute('bidimailui-direction-uniformity', detectedDirection);
    } catch (ex) {
    }
  }
};

BiDiMailUI.Display.setDirections = function (body, forcedDirection) {
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


  switch (forcedDirection) {
  case 'ltr':
  case 'rtl':
    body.removeAttribute('bidimailui-use-detected-directions');
    if (!body.hasAttribute('bidimailui-original-direction')) {
      body.setAttribute('bidimailui-original-direction', body.style.direction);
    }
    body.style.direction = forcedDirection;
    break;
  default: {
    const originalBodyCSSDirectionProperty =
      body.getAttribute('bidimailui-original-direction');
    if (originalBodyCSSDirectionProperty?.length > 0) {
      body.style.direction = originalBodyCSSDirectionProperty;
    } else {
      body.style.removeProperty('direction');
    }
    body.setAttribute('bidimailui-use-detected-directions', true);
  }
  }
};

// The actions we need to take to fix character set misdecoding issues depends, among
// other things, on how the message was decoded to begin with - via a categorization
// into one of three kinds of decoding. This function performs the categorization
// (using a preference to fill in when the actual decoding it not know).
BiDiMailUI.Display.resolveDecodingType = (preferred, current) => {
  if ((preferred != null) && (current == preferred)) {
    return "preferred-charset";
  }
  if (["ISO-8859-8-I", "ISO-8859-8", "windows-1255", "ISO-8859-6", "windows-1256"].includes(current)) {
    return "preferred-charset";
  }
  if (["US-ASCII", "ISO-8859-1", "windows-1252", null].includes(current)) {
    return "latin-charset";
  }
  if (["", "UTF-8"].includes(current)) {
    // sometimes the charset is misread, and Mozilla sets it to "" while
    // using UTF-8; this is the case specifically for
    // Content-type: text/plain; charset=iso-8859-I
    // in the message... but we can't know that without streaming the raw
    // message, which is expensive
    return "UTF-8";
  }
  return "UTF-8";  // a default of sorts
};


// Detect and attempt to recode content of wholly or partially mis-decoded messages
//
// Notes:
//
// 1. Beginning with TB 91, it is not possible to force a message' character set.
// 2. The return value is false if  a reload is necessary. But - again, it can't
//    be respected. So we'll have to do the best we can.
//
//   This function assumes the preferred charset is either windows-1255,
//   windows-1256 or null; see populatePreferredCharset().
//
BiDiMailUI.Display.fixLoadedMessageCharsetIssues = function (cMCParams) {
  let patternToMatch;

  /*
  There are 4 parameters affecting what we need to do with the loaded message
  with respect to reloading or recoding.

  1. Message has been reloaded (by the previous run of this function) or has
     otherwise been forced into a specific charset (Y/N) . This will always
     be true in TB 91 and later, as they don't support reloading, so it is as
     though the charset was forced.
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

  1. (Before TB 91) If we tell the app to change the charset, the message will be
      reloaded and this function will be triggered again
  2. There's 'waste' in this algorithm - after recoding, we again check for UTF-8
     and windows-1255/6 text although we sometimes know the answer; but how to
     safely convey this information to the next load event? Using a global variable
      may be unsafe
  */

  // This sets parameter no. 1 (and will be true for TB 91)
  const mustKeepCharset = cMCParams.dontReload || cMCParams.charsetOverrideInEffect;

  // This sets parameter no. 2
  cMCParams.mailnewsDecodingType = BiDiMailUI.Display.resolveDecodingType(cMCParams?.preferredCharset, cMCParams?.currentCharset);
  cMCParams.body.setAttribute('bidimailui-detected-decoding-type', cMCParams.mailnewsDecodingType);


  // This sets parameter no. 3
  // (note its value depends on parameter no. 2)
  let havePreferredCharsetText;
  if (cMCParams.preferredCharset != null) { havePreferredCharsetText = false; }
  if (cMCParams.mailnewsDecodingType === "preferred-charset") {
    // text in the preferred charset is properly decoded, so we only
    // need to look for characters in the Hebrew or Arabic Unicode ranges;
    // we look for a sequence, since some odd character may be the result
    // of misdecoding UTF-8 text
    patternToMatch = new RegExp(
      (cMCParams.preferredCharset === "windows-1255") ?
        "[\\u0590-\\u05FF\\uFB1D-\\uFB4F]{3,}" :
        // it's "windows-1256"
        "[\\u0600-\\u06FF\\uFE50-\\uFEFC]{3,}");
  } else {
    // text in the preferred charset is properly decoded, so we only
    // need to look for a character in the Hebrew or Arabic Unicode range
    patternToMatch = new RegExp( (cMCParams.mailnewsDecodingType === "latin-charset") ?
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
  havePreferredCharsetText = BiDiMailUI.textMatches(document, NodeFilter, cMCParams.body, patternToMatch) ||
    (cMCParams.messageSubject && patternToMatch.test(cMCParams.messageSubject));

  // This sets parameter no. 4
  // (note its value depends on parameter no. 2)
  let haveUTF8Text;

  patternToMatch = new RegExp((cMCParams.mailnewsDecodingType === "UTF-8") ?
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

  haveUTF8Text = BiDiMailUI.textMatches(document, NodeFilter, cMCParams.body, patternToMatch) ||
    patternToMatch.test(cMCParams.messageSubject);

  // ... and now act based on the parameter values

  if (!mustKeepCharset) {
    switch (cMCParams.mailnewsDecodingType) {
    case "latin-charset":
      if (!havePreferredCharsetText) {
        if (!haveUTF8Text) {
          // NNNN
        } else {
          // NNNY
          cMCParams.needCharsetForcing = true;
          cMCParams.charsetToForce = "utf-8";
          return false;
        }
      } else {
        if (!haveUTF8Text) {
          // NNYN
          cMCParams.needCharsetForcing = true;
          cMCParams.charsetToForce = cMCParams.preferredCharset;
          return false;
        }
        // NNYY
        cMCParams.recodeUTF8 = true;
        cMCParams.recodePreferredCharset = true;
            // but note we might still need to force the charset!
      }
      break;
    case "preferred-charset":
      if (!havePreferredCharsetText) {
        if (!haveUTF8Text) {
          // NCNN
        } else {
          // NCNY
          cMCParams.needCharsetForcing = true;
          cMCParams.charsetToForce = "utf-8";
          return false;
        }
      } else if (!haveUTF8Text) {
        // NCYN
      } else {
        // NCYY
        cMCParams.needCharsetForcing = true;
        cMCParams.charsetToForce = "windows-1252";
        return false;
      }
      break;
    case "UTF-8":
      if (!havePreferredCharsetText) {
        if (!haveUTF8Text) {
          // NUNN
        } else {
          // NUNY
        }
      } else {
        if (!haveUTF8Text) {
          // NUYN
          cMCParams.needCharsetForcing = true;
          cMCParams.charsetToForce = cMCParams.preferredCharset;
          return false;
        }
        // NUYY
        cMCParams.needCharsetForcing = true;
        cMCParams.charsetToForce = "windows-1252";
        return false;
      }
    }
  } else { // mustKeepCharset
    switch (cMCParams.mailnewsDecodingType) {
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

  // workaround for mozdev bug 23322 / bugzilla bug 486816:
  // Mozilla may be 'cheating' w.r.t. decoding charset
  //
  // ... and it seems we can never meet this criterion with TB 91 or later
  if (!cMCParams.needCharsetForcing) {
    patternToMatch = new RegExp(BiDiMailUI.RegExpStrings.BOTCHED_UTF8_DECODING_SEQUENCE);
    if (BiDiMailUI.textMatches(document, NodeFilter, cMCParams.body, patternToMatch) ||
        patternToMatch.test(cMCParams.messageSubject)) {
      if (!mustKeepCharset) {
        cMCParams.needCharsetForcing = true;
        // let's be on the safe side
        cMCParams.charsetToForce = "windows-1252";
        return false;
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
    }
  }
  return true;
};


// returns true if numeric entities were found
BiDiMailUI.Display.decodeNumericHTMLEntitiesInText = function (element) {
  let entitiesFound = false;
  const treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null, // additional filter function
    false
  );
  let node;
  while ((node = treeWalker.nextNode()) != null) {
    node.data = node.data.replace(
      /&#(\d+);/g,
      () => {
        entitiesFound = true;
        return String.fromCharCode(RegExp.$1);
      }
    );
  }
  return entitiesFound;
};
