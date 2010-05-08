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

// Code outside BiDi Mail UI should only use the BDMAction and BDMActionPhase
// functions: BDMActionPhase functions are the four phases of action performed
// when loading a message; BDMActions may be performed afterwards, repeatedly

function BDMAction_setMessageDirectionForcing(body,forcedDirection)
{
  // we assume forcedDirection is 'rtl', 'ltr' or null
#ifdef DEBUG_setMessageDirectionForcing
  gJSConsoleService.logStringMessage('SetMessageDirection(' + forcedDirection + ')');
#endif
  setDirections(body,forcedDirection);
  if (!forcedDirection) {
    body.removeAttribute('bidimailui-forced-direction');
  }
  else {
    body.setAttribute('bidimailui-forced-direction',forcedDirection);
  }
}

function BDMActionPhase_charsetMisdetectionCorrection(BDMCharsetPhaseParams)
{
  if (gBDMPrefs.getBoolPref("display.autodetect_bidi_misdecoding", true)) {
    var charsetPref = null;
    charsetPref = gBDMPrefs.prefService.getComplexValue(
      "mailnews.view_default_charset",
      Components.interfaces.nsIPrefLocalizedString).data;

#ifdef DEBUG_charsetMisdetectionCorrectionPhase
    gJSConsoleService.logStringMessage("charsetPref = " + charsetPref);
#endif
      
    // if the charset pref is not one we can use for detecting mis-decoded
    // codepage charsets, maybe we should tell the user about it
      
    if ((charsetPref != "ISO-8859-8-I") &&
        (charsetPref != "ISO-8859-8") &&
        (charsetPref != "ISO-8859-6") &&
        (charsetPref != "windows-1255") &&
        (charsetPref != "windows-1256") &&
        (!gBDMPrefs.getBoolPref("display.user_accepts_unusable_charset_pref", false))) {
       promptForDefaultCharsetChange();
    }

    if (!fixLoadedMessageCharsetIssues(
      BDMCharsetPhaseParams.body,charsetPref,BDMCharsetPhaseParams)) {
      // the message will be reloaded, let's not do anything else 
      return;
    }
     
    if (BDMCharsetPhaseParams.charsetOverrideInEffect) {
      BDMCharsetPhaseParams.body.setAttribute('bidimailui-charset-is-forced',true);
    }

#ifdef DEBUG_browserOnLoadHandler
    gJSConsoleService.logStringMessage("completed charset correction phase");
#endif

  }
}

function BDMActionPhase_htmlNumericEntitiesDecoding(body)
{
  if (gBDMPrefs.getBoolPref("display.decode_numeric_html_entities", false)) {
    if (decodeNumericHTMLEntitiesInText(body)) {
      body.setAttribute('bidimailui-found-numeric-entities',true);
    }
  }
}

function BDMActionPhase_quoteBarsCSSFix(domDocument)
{
  var head = domDocument.getElementsByTagName("head")[0];
  if (head) {
    var newSS = domDocument.createElement("link");
    newSS.rel  = "stylesheet";
    newSS.type = "text/css";
    newSS.href = "chrome://bidimailpack/content/quotebar.css";
    head.appendChild(newSS);
  }
}

function BDMActionPhase_directionAutodetection(body)
{
  if (!gBDMPrefs.getBoolPref("display.autodetect_direction", true))
    return;

  var detectedOverallDirection = directionCheck(body);
#ifdef DEBUG_directionAutodetection
  gJSConsoleService.logStringMessage("detected overall direction: " + detectedDirection);
#endif
  if (detectedOverallDirection != "mixed") {
    // The message is either neutral in direction, all-LTR or all-RTL,
    // so we can just set the direction for the entire body

    if ((detectedOverallDirection == "rtl") ||
        (detectedOverallDirection == "ltr")) {
      body.style.direction = detectedOverallDirection;
      body.setAttribute('dir',detectedOverallDirection);
    }
    body.setAttribute('bidimailui-direction-uniformity',detectedOverallDirection);
    return;
  }
  
  // The message has both LTR and RTL content in the message,
  // so we'll break it up into smaller block elements whose direction can be set separately
  // and detect-and-set for each such element
  
  preprocessMessageDOM(body);
  detectAndSetDirections(body,null);
}    


// Functions from here on should not be used by code outside this file

function promptForDefaultCharsetChange()
{
  var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                          .getService(Components.interfaces.nsIPromptService);
  var list = [
    gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1255"),
    gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1256"),
    gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.leave_as_is")];
  var selected = {};

#ifdef DEBUG_promptForDefaultCharsetChange
  gJSConsoleService.logStringMessage("gBDMStrings.GetStringFromName(\"bidimailui.chraset_dialog.set_to_windows_1255\") =\n" + gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.set_to_windows_1255"));
#endif

  var ok = prompts.select(
    window,
    gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.window_title"),
    gBDMStrings.GetStringFromName("bidimailui.chraset_dialog.dialog_message"),
    list.length, list, selected);

  if (ok) {

#ifdef DEBUG_promptForDefaultCharsetChange
  gJSConsoleService.logStringMessage("ok!");
#endif

    var str = 
      Components.classes["@mozilla.org/supports-string;1"]
                .createInstance(Components.interfaces.nsISupportsString);
    switch (selected.value) {
      case 0:
        str.data = charsetPref = "windows-1255";
        gBDMPrefs.prefService.setComplexValue("mailnews.view_default_charset", 
          Components.interfaces.nsISupportsString, str);
          break;
      case 1:
        str.data = charsetPref = "windows-1256";
        gBDMPrefs.prefService.setComplexValue("mailnews.view_default_charset", 
              Components.interfaces.nsISupportsString, str);
        break;
      case 2:
        gBDMPrefs.setBoolPref("display.user_accepts_unusable_charset_pref", true);
        break;
    }
  }
#ifdef DEBUG_promptForDefaultCharsetChange
  else gJSConsoleService.logStringMessage("not ok!");
#endif
}

// split elements in the current message (we assume it's moz-text-plain)
// so that \n\n in the message text means moving to another block element
// this allows setting per-paragraph direction, assuming paragraphs are
// separated by double \n's (with possibly some neutral characters between 
// them, e.g. hello\n---\ngoodbye )
function splitTextElementsInPlainMessageDOMTree(subBody)
{
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
  gJSConsoleService.logStringMessage("in splitTextElementsInPlainMessageDOMTree()");
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
    gJSConsoleService.logStringMessage("-----\ntext node\n-----\n" + node.nodeValue);
#endif
    // TODO: ensure the parent's a PRE or BLOCKQUOTE or something else that's nice
    if (! /\n[ \f\r\t\v\n\u00A0\\u2028\\u2029!-@\[-`{-\xA0\u2013\u2014\uFFFD]*\n/m.test(node.nodeValue)) {
       node = treeWalker.nextNode();
       continue;
    }
#ifdef DEBUG_splitTextElementsInPlainMessageDOMTree
    gJSConsoleService.logStringMessage(RegExp.leftContext + "\n-----\n"+RegExp.lastMatch+"\n-----\n"+RegExp.rightContext);
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
//    gJSConsoleService.logStringMessage("nextsibling =\n" + node.nextSibling + "\nvalue:\n"+(node.nextSibling ? node.nextSibling.nodeValue : null));
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
}

// wraps every sequence of text node, A's etc in a
// moz-text-flowed message's DOM tree within a DIV
// (whose direction we can later set)
function wrapTextNodesInFlowedMessageDOMTree(subBody)
{
  var clonedDiv = subBody.ownerDocument.createElement("DIV");
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
      gJSConsoleService.logStringMessage("not handling node\n" + node.nodeValue + "\nwith parent node name " + node.parentNode.nodeName);
#endif
      continue;
    }
    if (node.parentNode.hasAttribute('bidimailui-generated') ||
        ((node.parentNode.nodeName == 'A') &&
        (node.parentNode.parentNode.hasAttribute('bidimailui-generated')))) {
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
      gJSConsoleService.logStringMessage("already handled node\n"+ node.nodeValue);
#endif
      continue;
    }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
    gJSConsoleService.logStringMessage("wrapping with DIV, node\n" + node.nodeValue);
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
    while (sibling = wrapperDiv.nextSibling) {
      if (sibling.nodeName == 'BLOCKQUOTE') {
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
        gJSConsoleService.logStringMessage("hit blockquote, finishing walk");
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
          gJSConsoleService.logStringMessage("hit BR with emptyLine = " + emptyLine + "\nfinishing walk");
#endif
        break;
      }
#ifdef DEBUG_wrapTextNodesInFlowedMessageDOMTree
      gJSConsoleService.logStringMessage("adding node " + sibling + " to DIV\nnode name:" + node.nodeName + "\nnode value\n" + node.nodeValue);
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
      gJSConsoleService.logStringMessage("walk ends after last sibling!");
#endif
  }
}

function preprocessMessageDOM(body)
{
#ifdef DEBUG_preprocessMessageDOM
  gJSConsoleService.logStringMessage("preprocessMessageDOM);
  if (body.childNodes.item(1))
    gJSConsoleService.logStringMessage("body.childNodes.item(1).className = " + body.childNodes.item(1).className);
  else
    gJSConsoleService.logStringMessage("body has no children");
#endif

  for (var i=0; i < body.childNodes.length; i++) {
    var subBody = body.childNodes.item(i);

#ifdef DEBUG_preprocessMessageDOM
    gJSConsoleService.logStringMessage('subbody ' + i + ' is ' + subBody.className);
#endif

    if (subBody.className == "moz-text-plain") {
      splitTextElementsInPlainMessageDOMTree(subBody);
    }
    else if (subBody.className == "moz-text-flowed") {
      wrapTextNodesInFlowedMessageDOMTree(subBody);
    }
  }
}

// Gather all the elements whose contents' direction 
// we need to check and whose direction we set accordingly
// (or force, as the case may be)
function gatherElementsRequiringDirectionSetting(
  body, elementsRequiringExplicitDirection)
{
  for (var i=0; i < body.childNodes.length; i++) {
    var subBody = body.childNodes.item(i);

    // Not touching elements which aren't moz-text-something,
    // as we don't know what to do with them
    if (! /^moz-text/.test(subBody.className))
      continue;
    
    elementsRequiringExplicitDirection.push(subBody);

#ifdef DEBUG_gatherElementsRequiringDirectionSetting
    gJSConsoleService.logStringMessage('subbody ' + i + ' is ' + subBody.className);
#endif

    var nodes;
    if (subBody.className == "moz-text-plain") {
      nodes =  subBody.getElementsByTagName("PRE");
      for (var j = 0; j < nodes.length; j++ ) {
        elementsRequiringExplicitDirection.push(nodes[j]);
      }
    }
    else if (subBody.className == "moz-text-flowed") {
      nodes =  subBody.getElementsByTagName("DIV");
      for (var j = 0; j < nodes.length; j++ ) {

        // Not touching elements which aren't moz-text-something,
        // as we don't know what to do with them
        if (/^moz-text/.test(nodes[j].className))
          continue;

        elementsRequiringExplicitDirection.push(nodes[j]);
      }
    }
    else if (subBody.className == "moz-text-html") {
      nodes =  subBody.getElementsByTagName("DIV");
      for (var j = 0; j < nodes.length; j++ ) {
        elementsRequiringExplicitDirection.push(nodes[j]);
      }
    }
    // set directions for blockquote elements for all message types
    nodes =  subBody.getElementsByTagName("BLOCKQUOTE");
    for (var j = 0; j < nodes.length; j++ ) {
      elementsRequiringExplicitDirection.push(nodes[j]);
    }
  }
}

function detectAndSetDirections(body)
{
#ifdef DEBUG_detectAndSetDirections
  gJSConsoleService.logStringMessage("in detectAndSetDirections for message\n" + GetLoadedMessage());
#endif
  
  var elementsRequiringExplicitDirection = new Array;
  gatherElementsRequiringDirectionSetting(
    body, elementsRequiringExplicitDirection);

#ifdef DEBUG_detectAndSetDirections
  gJSConsoleService.logStringMessage("elementsRequiringExplicitDirection.length = " + elementsRequiringExplicitDirection.length);
#endif

  // direction-check all of the elements whose direction should be set explicitly

  for (i=0; i < elementsRequiringExplicitDirection.length; i++) {
    var node = elementsRequiringExplicitDirection[i];
    try {
   
#ifdef DEBUG_detectAndSetDirections
      gJSConsoleService.logStringMessage('elementsRequiringExplicitDirection[ ' + i + ']: ' + node + "\ntype: " + node.nodeType + "\nclassName: " + node.className + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
        
      var detectedDirection = directionCheck(node);
#ifdef DEBUG_detectAndSetDirections
      gJSConsoleService.logStringMessage("detected direction: " + detectedDirection);
#endif
      if (detectedDirection != "neutral") {
        // "mixed" -> "rtl" as far as direction is concerned
        var newDirection = (detectedDirection == "ltr" ? "ltr" : "rtl");
        node.style.direction = newDirection;
        node.setAttribute('dir',newDirection);
      }
      node.setAttribute('bidimailui-direction-uniformity',detectedDirection);
    // otherwise, let's not set the direction of an all-neutral-char node
    } catch(ex) {
#ifdef DEBUG_detectAndSetDirections
      gJSConsoleService.logStringMessage(ex);
#endif
    }
  }
}

function setDirections(body, forcedDirection)
{
#ifdef DEBUG_setDirections
  gJSConsoleService.logStringMessage('settings directions to ' + (forcedDirection ? forcedDirection : 'detected directions'));
#endif
  var elementsRequiringExplicitDirection = new Array;
  gatherElementsRequiringDirectionSetting(
    body, elementsRequiringExplicitDirection);

  if (forcedDirection != null) {
    for (i=0; i < elementsRequiringExplicitDirection.length; i++) {
#ifdef DEBUG_detectAndSetDirections
      node =  elementsRequiringExplicitDirection[i];
      gJSConsoleService.logStringMessage('elementsRequiringExplicitDirection[ ' + i + ']: ' + node + "\ntype: " + node.nodeType + "\nclassName: " + node.className + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
      elementsRequiringExplicitDirection[i].style.direction = forcedDirection;
      elementsRequiringExplicitDirection[i].setAttribute('dir',forcedDirection);

    }
    return;
  }
  
  // need to revert to the detected directions

  for (i=0; i < elementsRequiringExplicitDirection.length; i++) {
    var node = elementsRequiringExplicitDirection[i];
    detectedDirection = node.getAttribute('bidimailui-direction-uniformity');
    // we're assuming detectedDirection is not null
    if (detectedDirection != "neutral") {
      // "mixed" -> "rtl" as far as direction is concerned
      var newDirection = (detectedDirection == "ltr" ? "ltr" : "rtl");
      node.style.direction = newDirection;
      node.setAttribute('dir',newDirection);
    }
  }
}



// Detect and attempt to reload/recode content of wholly or partially 
// mis-decoded messages (return false if the message has been set to 
// be reloaded)
function fixLoadedMessageCharsetIssues(
  element,
  preferredCharset,
  BDMCharsetPhaseParams)
{
  var contentToMatch;

#ifdef DEBUG_fixLoadedMessageCharsetIssues
  gJSConsoleService.logStringMessage('in fixLoadedMessageCharsetIssues()');
#endif

  // for our purposes at the moment, we 'prefer' windows-1255/6 over
  // the ISO single-byte charsets

  if ((preferredCharset == "windows-1255") ||
      (preferredCharset == "ISO-8859-8-I") ||
      (preferredCharset == "ISO-8859-8")) {
      preferredCharset = "windows-1255";
  }
  if ((preferredCharset == "windows-1256") ||
      (preferredCharset == "ISO-8859-6")) {
      preferredCharset = "windows-1256";
  }
 
 
  // If preferredCodepageCharset is not set to one of windows-1255/6 or
  // equivalents, we will completely ignore text in those codepages - we
  // won't try to recover it in  any way (but we will try to recover 
  // UTF-8 text)


  if ((preferredCharset != "windows-1255") &&
      (preferredCharset != "windows-1256")) {
    preferredCharset = null;
  }
  
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
  4. Message contains UTF-8 text (Y/N)

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
         we'll try recording UTF-8 text, but it'll probably won't work well
  *UY* - This is very bad, since we're not allowed to change charset;
         we'll try recording windows-1255/6 text, but it'll probably won't work well
         
  Extra Notes:

  1. If we tell mailnews to change the charset, the message will be reloaded and
     this function will be triggered again
  2. There's 'waste' in this algorithm - after recoding, we again check for UTF-8
     and windows-1255/6 text although we actually know the answer; but how to safely
     convey this information to the next load event?
  3. We're not specifically checking the subject line
  */
  
  // this sets parameter no. 1
  var mustKeepCharset = 
    BDMCharsetPhaseParams.dontReload ||
    BDMCharsetPhaseParams.charsetOverrideInEffect;

  // this sets parameter no. 2
  var mailnewsDecodingType;
#ifdef DEBUG_fixLoadedMessageCharsetIssues
  gJSConsoleService.logStringMessage('current charset used for decoding' + BDMCharsetPhaseParams.currentCharset);
#endif
  if ((preferredCharset != null) &&
      (BDMCharsetPhaseParams.currentCharset == preferredCharset))
    mailnewsDecodingType = "preferred-charset";
  else if ((((BDMCharsetPhaseParams.currentCharset == "ISO-8859-8-I") ||
             (BDMCharsetPhaseParams.currentCharset == "ISO-8859-8")) && 
            (preferredCharset == "windows-1255") ) ||
           ((BDMCharsetPhaseParams.currentCharset == "ISO-8859-6") && 
            (preferredCharset == "windows-1255") ) ) {
    mailnewsDecodingType = "preferred-charset";
  }
  else switch(BDMCharsetPhaseParams.currentCharset) {
    case "US-ASCII":
    case "ISO-8859-1":
    case "windows-1252":
    case null:
      mailnewsDecodingType = "latin-charset"; break;
    case "":
      // sometimes the charset is misread, and Mozilla sets it to "" while
      // using UTF-8; this is the case specifically for
      // Content-type: text/plain; charset=iso-8859-I
      // in the message... but we can't know that without streaming the raw
      // message, which is expensive
    case "UTF-8":
      mailnewsDecodingType = "UTF-8"; break;
    default: 
#ifdef DEBUG_fixLoadedMessageCharsetIssues
  gJSConsoleService.logStringMessage(
    'returning since BDMCharsetPhaseParams.currentCharset = ' 
    + BDMCharsetPhaseParams.currentCharset);
#endif
      return true;
  }
  element.setAttribute('bidimailui-detected-decoding-type',mailnewsDecodingType);


  // this sets parameter no. 3
  // (note its value depends on parameter no. 2)
  var havePreferredCharsetText;

  if (preferredCharset != null) {
    if (mailnewsDecodingType == "preferred-charset") {
      // text in the preferred charset is properly decoded, so we only
      // need to look for characters in the Hebrew or Arabic Unicode ranges;
      // we look for a sequence, since some odd character may be the result
      // of misdecoding UTF-8 text
      contentToMatch = new RegExp(
        (preferredCharset == "windows-1255") ?
        "[\\u0590-\\u05FF\\uFB1D-\\uFB4F]{3,}" : "[\\u0600-\\u06FF\\uFE50-\\uFEFC]{3,}");
    }
    else {
      // text in the preferred charset is properly decoded, so we only
      // need to look for a character in the Hebrew or Arabic Unicode range
      contentToMatch = new RegExp(
        (mailnewsDecodingType == "latin-charset") ?
        // Here we want a sequence of Unicode value of characters whose 
        // windows-1252 octet is such that would be decoded as 'clearly'
        // Hebrew or Arabic text; we could be less or more picky depending
        // on what we feel about characters like power-of-2, paragraph-mark,
        // plus-minus etc. ; let's be conservative: the windows-1255
        // and windows-1256 octet ranges corresponding to the letters 
        // themselves fall within the range C0-FF; this range is all accented
        // Latin letters in windows-1252, whose Unicode values are the
        // same as their octets
        "[\\u00C0-\\u00FF]{3,}" :
        // Here we know that mailnewsDecodingType == "UTF-8"; if
        // you decode windows-1255/6 content as UTF-8, you'll get failures
        // because you see multi-octet-starter octets (11xxxxxx) followed
        // by other multi-octet-starter octets rather than 
        // multi-octect-continuer octets (10xxxxxx); what mailnews does in
        // such cases is emit \uFFFD, which is the Unicode 'replacement
        // character'; let's be cautious, though, and look for repetitions
        // of this rather than the odd encoding error or what-not
        "\\uFFFD{3,}");
    }    
    havePreferredCharsetText = matchInText(element, contentToMatch);
  }
  else {
    havePreferredCharsetText = false;
  }
  
  // this sets parameter no. 4
  // (note its value depends on parameter no. 2)
  var haveUTF8Text;
  
  contentToMatch = new RegExp (
    (mailnewsDecodingType == "UTF-8") ?
    // The only characters we can be sure will be properly decoded in windows-1252
    // when they appear after UTF-8 decoding are those with single octets in UTF-8
    // and the same value as windows-1252; if there's anything else we'll be
    // conservative and assume some UTF-8 decoding is necessary
    "[^\\u0000-\\u007F\\u00A0-\\u00FF]" :
    // mailnewsDecodingType is latin-charset or preferred-charset
    //
    // TODO: some of these are only relevant for UTF-8 misdecoded as windows-1252 
    // (or iso-8859-1; mozilla cheats and uses windows-1252), 
    //
    MISDETECTED_UTF8_SEQUENCE);

  haveUTF8Text = matchInText(element, contentToMatch);

#ifdef DEBUG_fixLoadedMessageCharsetIssues
  gJSConsoleService.logStringMessage("--------\n " +
    (mustKeepCharset ? "Y" : "N") +
    ((mailnewsDecodingType == "latin-charset") ? "N" :
     ((mailnewsDecodingType == "preferred-charset") ? "C" : "U")) +
    (havePreferredCharsetText ? "Y" : "N") +
    (haveUTF8Text ? "Y" : "N") + 
    "\n--------");
#endif

  // ... and now act based on the parameter values
  
  if (!mustKeepCharset) {
    switch(mailnewsDecodingType) {
      case "latin-charset":
        if (!havePreferredCharsetText) {
          if (!haveUTF8Text) {
            // NNNN
          }
          else {
            // NNNY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
            gJSConsoleService.logStringMessage("Forcing charset UTF-8");
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = "utf-8";
            return;
          }
        }
        else {
          if (!haveUTF8Text) {
            //NNYN 
#ifdef DEBUG_fixLoadedMessageCharsetIssues
            gJSConsoleService.logStringMessage("Forcing charset " + preferredCharset);
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = preferredCharset;
            return false;
          }
          else {
            //NNYY
            if (performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,true,true)) {
#ifdef DEBUG_fixLoadedMessageCharsetIssues
              gJSConsoleService.logStringMessage(
                "re-applying charset - bug workaround");
#endif
              // need to re-apply the same charset, as a workaround for a weird mailnews bug
              BDMCharsetPhaseParams.needCharsetForcing = true;
              BDMCharsetPhaseParams.charsetToForce = BDMCharsetPhaseParams.currentCharset;
              return;
            }
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
            gJSConsoleService.logStringMessage("Forcing charset UTF-8");
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = "utf-8";
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
            gJSConsoleService.logStringMessage("Forcing charset windows-1252");
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = "windows-1252";
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
            gJSConsoleService.logStringMessage("Forcing charset " + preferredCharset);
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = preferredCharset;
            return;
          }
          else {
            // NUYY
#ifdef DEBUG_fixLoadedMessageCharsetIssues
            gJSConsoleService.logStringMessage("Forcing charset windows-1252");
#endif
            BDMCharsetPhaseParams.needCharsetForcing = true;
            BDMCharsetPhaseParams.charsetToForce = "windows-1252";
            return;
          }
        }
    }
  }
  else { // reloading in different charset is allowed
    switch(mailnewsDecodingType) {
      case "latin-charset":
        if (!havePreferredCharsetText) {
          if (!haveUTF8Text) {
            // YNNN
          }
          else {
            // YNNY
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,false,true);
          }
        }
        else {
          if (!haveUTF8Text) {
            // YNYN
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,true,false);
          }
          else {
            // YNYY
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,true,true);
          }
        }
        break;
      case "preferred-charset":
        if (!havePreferredCharsetText) {
          if (!haveUTF8Text) {
            // YCNN
          }
          else {
            // YCNY
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,false,true);
          }
        }
        else {
          if (!haveUTF8Text) {
            // YCYN
          }
          else {
            // YCYY
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,false,true);
          }
        }
        break;
      case "UTF-8":
        if (!havePreferredCharsetText) {
          if (!haveUTF8Text) {
            // YUNN
          }
          else {
            // YUNY
          }
        }
        else {
          if (!haveUTF8Text) {
            // YUYN
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,true,false);
          }
          else {
            // YUYY
            performCorrectiveRecoding(element,preferredCharset,mailnewsDecodingType,true,false);
          }
        }
    }
  }
  return true;
}

// returns true if numeric entities were found
function decodeNumericHTMLEntitiesInText(element)
{
  var entitiesFound = false;
  var treeWalker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null, // additional filter function
    false
  );
  while((node = treeWalker.nextNode())) {
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
