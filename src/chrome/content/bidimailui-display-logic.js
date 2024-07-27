var { BiDiMailUI } = ChromeUtils.import("chrome://bidimailui/content/bidimailui-common.js");

// Code outside BiDi Mail UI should only use the
// BiDiMailUI.Display.ActionPhases and perhaps the
// BiDiMailUI.Display.setMessageDirectionForcing function
// (ActionPhase functions are the four phases of action
// performed when loading a message)

BiDiMailUI.Display = {};

BiDiMailUI.Display.ActionPhases = {};


// Detect and attempt to recode content of wholly or partially mis-decoded messages;
// mark DOM as appropriate; if the character set was not forced - indicate
// the correction strategy via cMCParams.
//
// Notes:
//
// * Beginning with TB 91, it is not possible to force a message' character set.
//   This cripples a lot of the logic here - and prevents us from correcting
//   a lot of the character set mis-decoding
// * The return value is false if  a reload is necessary. But - again, it can't
//   be respected. So we'll have to do the best we can.
// * This function assumes the preferred charset is either windows-1255,
//   windows-1256 or null; see getPreferredCharset().
BiDiMailUI.Display.ActionPhases.charsetMisdetectionCorrection = function (cMCParams) {
  cMCParams.preferredCharset ??= BiDiMailUI.Display.getPreferredCharset();

  BiDiMailUI.Display.examineMessageForCharsetCorrection(cMCParams);
  // ... and now act based on the parameter values
  let strategy = BiDiMailUI.Display.resolveCharsetHandlingStrategy(
    cMCParams.mustKeepCharset, cMCParams.mailnewsDecodingType, cMCParams.havePreferredCharsetText, cMCParams.haveUTF8Text);
  if (strategy.charsetToForce === "preferred") {
    strategy.charsetToForce = cMCParams.preferredCharset;
  }
  BiDiMailUI.Display.possiblyCorrectCharsetHandlingStrategy(strategy, cMCParams);

  cMCParams = { ...cMCParams, ...strategy };

  if (!strategy.forceCharsetChange) {
    BiDiMailUI.performCorrectiveRecodingOnBody(cMCParams, strategy);
    BiDiMailUI.performCorrectiveRecodingOnSubject(cMCParams, strategy);

    // it may be the case that the corrective recoding suggests we need to force
    // the charset even though we've already done so; currently this is only
    // possible in the situation of bug 18707
    //
    // TODO: Can this even happen with TB 115 or later?
    //
    if (!cMCParams.mustKeepCharset && strategy.forceCharsetChange) {
      strategy.charsetToForce = cMCParams.currentCharset;
      cMCParams.charsetToForce = cMCParams.currentCharset;
    }
  }

  if (strategy.forceCharsetChange) {
    // This is where we would force the charset. But, alas, we can't
    // do this since Thunderbird 91... so doing nothing.
  }
};

BiDiMailUI.Display.ActionPhases.htmlNumericEntitiesDecoding = function (body) {
  if (BiDiMailUI.Prefs.get("display.decode_numeric_html_entities", false)) {
    if (BiDiMailUI.Display.decodeNumericHTMLEntitiesInText(body)) {
      body.setAttribute("bidimailui-found-numeric-entities", 'true');
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

  const detectedOverallDirection = BiDiMailUI.directionCheck(body);
  body.setAttribute('bidimailui-direction-uniformity', detectedOverallDirection);
  if (detectedOverallDirection === "mixed") {
    // The message has both LTR and RTL content in the message,
    // so we'll break it up into smaller block elements whose direction
    // can be set separately and detect-and-set for each such element
    BiDiMailUI.Display.preprocessMessageDOM(body);
    BiDiMailUI.Display.detectAndMarkDirections(body);
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
  default:
    return null;
  }
};

BiDiMailUI.Display.getPreferredCharset = function () {
  let charsetPrefValue = BiDiMailUI.Prefs.get("display.preferred_single_byte_charset", null);
  let canonicalizedPrefValue = BiDiMailUI.Display.canonicalizePreferredCharset(charsetPrefValue);
  return canonicalizedPrefValue ??
    (BiDiMailUI.Prefs.get("display.user_forgoes_preferred_single_byte_charset") ?
      null : BiDiMailUI.MessageOverlay.promptAndSetPreferredSingleByteCharset()
    );
};

// split elements in the current message (we assume it's moz-text-plain)
// so that \n\n in the message text means moving to another block element
// this allows setting per-paragraph direction, assuming paragraphs are
// separated by double \n's (with possibly some neutral characters between
// them, e.g. hello\n---\ngoodbye )
BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree = function (subBody) {
  let textWalker = BiDiMailUI.createTextWalker(subBody);
  let node = textWalker.nextNode();
  while (node) {
    // TODO: ensure the parent's a PRE or BLOCKQUOTE or something else that's nice
    let textSplit = new RegExp(BiDiMailUI.RegExpStrings.TEXT_SPLIT_SEQUENCE, "m");

    if (!textSplit.test(node.nodeValue)) {
      node = textWalker.nextNode();
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

    const newNode = textWalker.nextNode();
    node = ((newNode !== node) ? newNode : textWalker.nextNode());
  }
};

// wraps every sequence of text node, A's etc. in a
// moz-text-flowed message's DOM tree within a DIV
// (whose direction we can later set)
BiDiMailUI.Display.wrapTextNodesInFlowedMessageDOMTree = function (subBody) {
  let ns = subBody.ownerDocument.documentElement.lookupNamespaceURI("html");
  let clonedDiv = subBody.ownerDocument.createElementNS(ns, "div");
  clonedDiv.setAttribute("bidimailui-generated", "true");
  let textWalker = BiDiMailUI.createTextWalker(subBody);
  let node;
  while ((node = textWalker.nextNode())) {
    let parent = node.parentNode;
    let grandParent = parent.parentNode;
    let parentName = parent.nodeName.toLowerCase();
    if ((parentName !== 'a') &&
        (parentName !== 'div') &&
        (parentName !== 'blockquote')) {
      // and other such elements within moz-text-flowed messages
      continue;
    }
    if (parent.hasAttribute('bidimailui-generated') ||
        ((parentName === 'A') &&
        (grandParent.hasAttribute('bidimailui-generated')))) {
      continue;
    }
    const wrapperDiv = clonedDiv.cloneNode(false);

    let emptyLine;
    if (parentName === 'a') {
      grandParent.replaceChild(wrapperDiv, parent);
      wrapperDiv.appendChild(parent);
      emptyLine = false;
    } else {
      parent.replaceChild(wrapperDiv, node);
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
      let siblingName = sibling.nodeName.toLowerCase();
      if (siblingName === 'blockquote') break;
      if (siblingName === 'br') {
        if (!emptyLine) {
          // if the DIV has any text content, it will have a one-line
          // height; otherwise it will have no height, and we need the
          // BR after it
          wrapperDiv.parentNode.removeChild(sibling);
        }
        break;
      }
      wrapperDiv.parentNode.removeChild(sibling);
      wrapperDiv.appendChild(sibling);
      // we're assuming empty lines in moz-text-flowed messages  can only be
      // one empty text node followed by a BR; and if we got here, we haven't
      // hit BR right after the first text node
      emptyLine = false;
    }
  }
};

BiDiMailUI.Display.preprocessMessageDOM = function (body) {
  for (const subBody of [ ...body.children ]) {
    switch (subBody.className) {
    case "moz-text-plain":   BiDiMailUI.Display.splitTextElementsInPlainMessageDOMTree(subBody); break;
    case "moz-text-flowed":  BiDiMailUI.Display.wrapTextNodesInFlowedMessageDOMTree(subBody);
    }
  }
};

// Gather all the elements whose contents' direction
// we need to check and whose direction we set accordingly
// (or force, as the case may be)
BiDiMailUI.Display.gatherElementsRequiringDirectionSetting = function (body) {
  // We'll pick up both complete sub-bodies - for whole-MIME-part-scope direction setting,
  // but also some sub-elements, created either by the message author (in case of HTML) or
  // by Thunderbird (when it lays out text messages), to perform higher-granularity
  // direction setting (e.g. think paragraphs within a text message)

  // TODO: Perhaps we can replace this whole function with a single more complex selector
  const relevantSubBodies = [ ...body.children ].filter((subBody) => /^moz-text/.test(subBody.className));
    // ... as we don't know what we're supposed to do with unmarked body children.
  let gatheredFromSubBodies = relevantSubBodies.map((subBody) => {
    const tags = {
      "moz-text-plain"   : [ "pre, blockquote" ],
      "moz-text-flowed"  : [ "div, blockquote" ],
      "moz-text-html"    : [ "div, table, blockquote" ]
    };
    let selector = `:is(${tags[subBody.className]})`;
    // TODO: Do we need this next bit?
    if (subBody.className === "moz-text-flowed") {
      selector += `:is(.moz-text-plain, .moz-text-html)`;
    }
    // So, the selector might be, say, ":is(pre, blockquote)"
    return [...subBody.querySelectorAll(selector)];
  });
  return [...relevantSubBodies, ...gatheredFromSubBodies.flat()];
};

BiDiMailUI.Display.detectAndMarkDirections = function (body) {
  const elements = BiDiMailUI.Display.gatherElementsRequiringDirectionSetting(body);
  elements.forEach((element) => {
    try {
      const directionUniformity = BiDiMailUI.directionCheck(element);
      element.setAttribute('bidimailui-direction-uniformity', directionUniformity);
    } catch (ex) { }
  });
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
    body.setAttribute('bidimailui-use-detected-directions', 'true');
  }
  }
};

// The actions we need to take to fix character set misdecoding issues depends, among
// other things, on how the message was decoded to begin with - via a categorization
// into one of three kinds of decoding. This function performs the categorization
// (using a preference to fill in when the actual decoding it not know).
BiDiMailUI.Display.resolveDecodingType = (preferred, current) => {
  if ((preferred !== null) && (current === preferred)) {
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

// Returns a regular express pattern for matching text in the preferred
// charset, within a message which has already been decoded (depending
// on how it was decoded)
BiDiMailUI.Display.getDecodedCharsetMatchPattern = function (preferredCharset, messageDecodingType) {
  switch (messageDecodingType) {
  case "preferred-charset":
    // text in the preferred charset is properly decoded, so we only need to look for
    // characters in the Hebrew or Arabic Unicode ranges; we look for a sequence,
    // since some odd character may be the result of misdecoding UTF-8 text
    return (preferredCharset === "windows-1255") ?
      "[\\u0590-\\u05FF\\uFB1D-\\uFB4F]{3,}" :
      // it's "windows-1256"
      "[\\u0600-\\u06FF\\uFE50-\\uFEFC]{3,}";
    // In the remaining cases, text in the preferred charset isn't properly decoded, so we only
    // need to look for a character in the Hebrew or Arabic Unicode range
  case "latin-charset":
    // Here we want a sequence of Unicode values of characters whose
    // windows-1252 octet is such that would be decoded as 'clearly'
    // Hebrew or Arabic text; we could be less or more picky depending
    // on what we feel about characters like power-of-2, paragraph-mark,
    // plus-minus etc. ; let's be conservative: the windows-1255
    // and windows-1256 octet ranges corresponding to the letters
    // themselves fall within the range C0-FF; this range is all accented
    // Latin letters in windows-1252, whose Unicode values are the
    // same as their octets
    return "[\\u00C0-\\u00FF]{3,}";
  case "utf-8":
  default:
    // Here we know that cMCParams.mailnewsDecodingType == "UTF-8"; if
    // you decode windows-1255/6 content as UTF-8, you'll get failures
    // because you see multi-octet-starter octets (11xxxxxx) followed
    // by other multi-octet-starter octets rather than
    // multi-octect-continuer octets (10xxxxxx); what mailnews does in
    // such cases is emit \uFFFD, which is the Unicode 'replacement
    // character'; let's be cautious, though, and look for repetitions
    // of this rather than the odd encoding error or what-not
    return "\\uFFFD{3,}";
  }
};

/**
 * Resolves the (possibly-refinable) strategy for handling potential misdecoded message text
 *
 * @param[in] mustKeepCharset
 *     Message has been reloaded (by the previous run of this function) or has
 *     otherwise been forced into a specific charset (Y/N) . This will always
 *     be true in TB 91 and later, as they don't support reloading, so it is as
 *     though the charset was forced.
 * @param[in] decodingType
 *     Charset used by mozilla to decode the message
 *
 *       L = Latin charset - windows-1252/equivalents, including no/empty charset
 *       P = Preferred charset - windows-1255/6
 *       U = UTF-8,
 * @param[in] havePreferredCharsetText
 *     Message contains windows-1255/6 text (Y/N)
 * @param[in] haveUTF8Text
 *     Message contains UTF-8 text (that is, UTF-8 octet sequences which are not
 *     iso-8859-1 chars 0-127) (Y/N)
 *
 * The strategy resolution logic is as follows:
 *
 *   *NNN - No problem, do nothing
 *   NLNY - Reload with UTF-8 (and continue with YUNY)
 *   NLYN - Reload with windows-1255/6  (and continue with YCYN)
 *   *LYY - Recode both UTF-8 and windows-1255/6
 *   *PNN - No problem, do nothing
 *   NPNY - Reload with UTF-8 (and continue with YUNY)
 *   *PYN - No problem, do nothing
 *   NPYY - This is bad, since we can't effectively recode; strangely enough, the
 *          best bet should be reloading with windows-1252 (and continue
 *          with one of YNNN-YNYY)
 *   *UN* - No problem, do nothing
 *   NUYN - Reload with windows-1255/6
 *   NUYY - This is bad, since we can't effectively recode; strangely enough, the
 *          best bet should be reloading with windows-1252 (and continue
 *          with one of YNNN-YNYY)
 *   YLNY - recode UTF-8 text
 *   YLYN - recode windows-1255/6 text
 *   YP*Y - This is very bad, since we're not allowed to change charset;
 *          we'll try recoding UTF-8 text, but it probably won't work well
 *   *UY* - This is very bad, since we're not allowed to change charset;
 *          we'll try recoding windows-1255/6 text, but it probably won't work well
 *
 * Extra Notes:
 *
 * 1. (Before TB 91) If we tell the app to change the charset, the message will be
 *    reloaded and this function will be triggered again
 * 2. There's 'waste' in this algorithm - after recoding, we again check for UTF-8
 *    and windows-1255/6 text although we sometimes know the answer; but how to
 *    safely convey this information to the next load event? Using a global variable
 *    may be unsafe
 */
BiDiMailUI.Display.resolveCharsetHandlingStrategy = function (
  mustKeepCharset, decodingType, havePreferredCharsetText, haveUTF8Text) {
  let stateCode =
    (mustKeepCharset ? "Y" : "N") +
    (decodingType.charAt(0).toUpperCase()) + // So it's L, P or U
    (havePreferredCharsetText ? "Y" : "N") +
    (haveUTF8Text ? "Y" : "N");
  const strategies = {
    NLNN : {},
    NLNY : { forceCharsetChange: true, charsetToForce: "utf-8" },
    NLYN : { forceCharsetChange: true, charsetToForce: "preferred" },
    NLYY : { recodeUTF8: true, recodePreferredCharset: true }, // but see possiblyCorrectCharsetHandlingStrategy() !
    NPNN : {},
    NPNY : { forceCharsetChange: true, charsetToForce: "utf-8" },
    NPYN : {},
    NPYY : { forceCharsetChange: true, charsetToForce: "windows-1252" },
    NUNN : {},
    NUNY : {},
    NUYN : { forceCharsetChange: true, charsetToForce: "preferred" },
    NUYY : { forceCharsetChange: true, charsetToForce: "windows-1252" },
    YLNN : { recodePreferredCharset: false, recodeUTF8: false },
    YLNY : { recodePreferredCharset: false, recodeUTF8: true  },
    YLYN : { recodePreferredCharset: true,  recodeUTF8: false },
    YLYY : { recodePreferredCharset: true,  recodeUTF8: true  },
    YPNN : { recodePreferredCharset: false, recodeUTF8: false },
    YPNY : { recodePreferredCharset: false, recodeUTF8: true  },
    YPYN : { recodePreferredCharset: false, recodeUTF8: false },
    YPYY : { recodePreferredCharset: false, recodeUTF8: true  },
    YUNN : { recodePreferredCharset: false, recodeUTF8: false },
    YUNY : { recodePreferredCharset: false, recodeUTF8: false },
    YUYN : { recodePreferredCharset: true,  recodeUTF8: false },
    YUYY : { recodePreferredCharset: true,  recodeUTF8: false }
  };
  return strategies[stateCode];
};

// Apply different examinations to the message, to inform a decision
// regarding what kind of charset mis-detection correction action it needs;
// also, make some DOM markings regarding this examination.
//
// Note Beginning with TB 91, it is not possible to force a message' character set.
// This cripples a lot of the logic here - and prevents us from correcting
// a lot of the character set mis-decoding
BiDiMailUI.Display.examineMessageForCharsetCorrection = function (cMCParams) {
  if (cMCParams.charsetOverrideInEffect) {
    cMCParams.body.setAttribute("bidimailui-charset-is-forced", "true");
  }

  // This sets parameter no. 1 (and will always be true for TB 91 and later)
  cMCParams.mustKeepCharset = cMCParams.dontReload || cMCParams.charsetOverrideInEffect;

  cMCParams.mailnewsDecodingType = BiDiMailUI.Display.resolveDecodingType(cMCParams?.preferredCharset, cMCParams?.currentCharset);
  cMCParams.body.setAttribute('bidimailui-detected-decoding-type', cMCParams.mailnewsDecodingType);

  let preferredCharsetMatcher = new RegExp(
    BiDiMailUI.Display.getDecodedCharsetMatchPattern(cMCParams.preferredCharset, cMCParams.mailnewsDecodingType));
  cMCParams.havePreferredCharsetText =
    BiDiMailUI.textMatches(cMCParams.body, preferredCharsetMatcher) ||
    (cMCParams.messageSubject && preferredCharsetMatcher.test(cMCParams.messageSubject));

  // This sets parameter no. 4
  // (note its value depends on parameter no. 2)

  let utf8Matcher = new RegExp((cMCParams.mailnewsDecodingType === "UTF-8") ?
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

  cMCParams.haveUTF8Text = BiDiMailUI.textMatches(cMCParams.body, utf8Matcher) ||
    utf8Matcher.test(cMCParams.messageSubject);
};

BiDiMailUI.Display.checkForBotchedUTF8Decoding = function (cMCParams) {
  let patternToMatch = new RegExp(BiDiMailUI.RegExpStrings.BOTCHED_UTF8_DECODING_SEQUENCE);
  return BiDiMailUI.textMatches(cMCParams.body, patternToMatch) ||
    patternToMatch.test(cMCParams.messageSubject);
};

// workaround for mozdev bug 23322 / bugzilla bug 486816:
// Mozilla may be 'lying' w.r.t. decoding charset
//
// ... and it seems we can never meet this criterion with TB 91 or later
//
// TODO: Try to integrate this into the previous two methods (examine, resolve strategy)
BiDiMailUI.Display.possiblyCorrectCharsetHandlingStrategy = function (strategy, cMCParams) {
  if (!strategy.forceCharsetChange) {
    if (BiDiMailUI.Display.checkForBotchedUTF8Decoding(cMCParams)) {
      if (!cMCParams.mustKeepCharset) {
        strategy.forceCharsetChange = true;
        // let's be on the safe side
        strategy.charsetToForce = "windows-1252";
      }
    }
  }
};

// returns true if numeric entities were found
BiDiMailUI.Display.decodeNumericHTMLEntitiesInText = function (element) {
  let textWalker = BiDiMailUI.createTextWalker(element);
  let entitiesFound = false;
  let replacer =  () => {
    entitiesFound = true;
    return String.fromCharCode(Number(RegExp.$1));
  };
  let node;
  while ((node = textWalker.nextNode()) != null) {
    node.data = node.data.replace(/&#(\d+);/g, replacer);
  }
  return entitiesFound;
};
