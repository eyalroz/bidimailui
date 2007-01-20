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

const MSFDirectionProperty = "bidiui.direction";

#ifdef DEBUG
// The following 2 lines enable logging messages to the javascript console:
var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

// Here is an example of a console log message describing a DOM node:
// jsConsoleService.logStringMessage('visiting node: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif

// workaround for bug 12469
var gMessageURI = null;

function SetMessageDirection(direction,setProperty)
{
#ifdef DEBUG_SetMessageDirection
  jsConsoleService.logStringMessage("direction = " + direction + " setProperty = " + setProperty );
#endif
  var messageContentElement;
  try {
    messageContentElement =
    GetMessageContentElement(getMessageBrowser().docShell.contentViewer
                                                         .DOMDocument);
  }
  catch (ex) {
    dump(ex);
    return;
  }

  messageContentElement.style.direction = direction;

#ifdef MOZ_THUNDERBIRD
  UpdateDirectionButtons(direction);
#endif

  if (setProperty) 
    SetMessageMSFDirectionProperty(direction);
}

function SetMessageMSFDirectionProperty(direction)
{
  // set the MSF direction property for the current message

  var messageURI = GetLoadedMessage();
  if (messageURI) {
    var messageHeader = messenger.msgHdrFromURI(messageURI);
    if(messageURI)  {
      messageHeader.setStringProperty(MSFDirectionProperty, direction);
    }
    else if (!messageHeader)
      dump("no message header for message URI\n" + messageURI);
  }
  dump("can't get the current message URI, so not setting direction property");
}

function SwitchMessageDirection()
{
  var messageContentElement;
  try {
    messageContentElement =
    GetMessageContentElement(getMessageBrowser().docShell.contentViewer
                                                         .DOMDocument);
  }
  catch (ex) {
    dump(ex);
    return;
  }

  var newDirection =
    (window.getComputedStyle(
     messageContentElement, null).direction == "rtl" ?
     "ltr" : "rtl");
  SetMessageDirection(newDirection,true);
}

function UpdateDirectionButtons(direction)  
{
#ifdef MOZ_THUNDERBIRD
  var caster = document.getElementById("ltr-document-direction-broadcaster");  
  caster.setAttribute("checked", direction == "ltr");  
  caster = document.getElementById("rtl-document-direction-broadcaster");  
  caster.setAttribute("checked", direction == "rtl");
#endif
}

function browserOnLoadHandler()
{
#ifdef DEBUG_browserOnLoadHandler
  jsConsoleService.logStringMessage("--- browserOnLoadHandler() ---");
#endif

  var domDocument;
  try {
    domDocument = this.docShell.contentViewer.DOMDocument;
  }
  catch (ex) {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("couldn't get DOMDocument");
#endif
    dump(ex);
    return;
  }

  var body = domDocument.body;
  if (!body) {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("couldn't get DOMDocument body");
#endif
    return;
  }

  // element which may contains message content (we filter them later)
  var elementsRequiringExplicitDirection = [body];
  elementsRequiringExplicitDirection.concat(body.getElementsByTagName("div"));


  var charsetPref = null;
  try {
    charsetPref = gBDMPrefs.prefService.getComplexValue(
      "mailnews.view_default_charset",
      Components.interfaces.nsIPrefLocalizedString).data;
  }
  catch (ex) { }
  var directionPref = gBDMPrefs.getBoolPref("display.autodetect_direction", true);

  if (!msgWindow) {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("couldn't get msgWindow");
#endif
    return;
  }
  
  var loadedMessageURI = GetLoadedMessage();
  if (loadedMessageURI == gMessageURI) {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("loadedMessageURI == gMessageURI, so we won't mess with the charset");
#endif
  }

  var directionDetectionRTLSequence = "([\\u0590-\\u05FF]|[\\uFB1D-\\uFB4F]|[\\u0600-\\u06FF]|[\\uFB50-\\uFDFF]|[\\uFE70-\\uFEFC]){3,}"
  var charsetDetectionRTLSequence;
  if (charsetPref == "windows-1255") // Hebrew, windows-1255
    charsetDetectionRTLSequence = "([\\u0590-\\u05FF]|[\\uFB1D-\\uFB4F]){3,}";
  else  // Arabic, windows-1256
    charsetDetectionRTLSequence = "([\\u0600-\\u06FF]|[\\uFB50-\\uFDFF]|[\\uFE70-\\uFEFC]){3,}";

  // Auto-detect some mis-decoded messages
  //
  // When shall we attempt re-detection and overriding of the character set?
  // not if the encoding has _already_ been overridden (either due to the pref
  // or not) and not if the default charset is not one of the one-octet codepages
  // we expect get mangled, and then only when the charset is reported as one of
  // the defaultish ones (or not reported at all); or, alternatively, when the
  // charset used is UTF-8 but the text appears to actually be in a one-octect
  // charsets.
  // Notes:
  // - Changing the charset here means that the message is re-loaded, which
  //   calls this function (the onLoad handler) again
  // - Since msgWindow.charsetOverride is true after our first change,
  //   this loop an actually an OR over the need to change the charset for any
  //   of the subbodies
  // - Sometimes the charset is not set, or set to ""; in this case we can't
  //   tell if mozilla is using UTF-8 or something else, so we apply all
  //   possible auto-detection methods

  if (charsetPref && loadedMessageURI != gMessageURI) {
    var misdecodeAutodetectPref =
      gBDMPrefs.getBoolPref("display.autodetect_bidi_misdecoding", true);
    if ( misdecodeAutodetectPref &&
         !msgWindow.charsetOverride)  {
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage('considering charset change');
#endif

      if ( (charsetPref == "windows-1255" || charsetPref == "windows-1256")&&
           (msgWindow.mailCharacterSet == "US-ASCII" ||
            msgWindow.mailCharacterSet == "ISO-8859-1" ||
            msgWindow.mailCharacterSet == "windows-1252" ||
            msgWindow.mailCharacterSet == "UTF-8" ||
            msgWindow.mailCharacterSet == "") ) {
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage("checking misdetected codepage");
#endif
        if (misdetectedRTLCodePage(body,charsetDetectionRTLSequence)) {
#ifdef DEBUG_browserOnLoadHandler
          jsConsoleService.logStringMessage("confirm misdetected codepage; setting charset to charsetPref " + charsetPref);
#endif
          MessengerSetForcedCharacterSet(charsetPref);
          return;
        }
      } else {
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage("not checking codepage since our charset pref is " + charsetPref);
#endif
      }
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage("reject misdetected codepage");
#endif
        
      if (msgWindow.mailCharacterSet != "UTF-8") {
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage("checking misdetected utf-8");
#endif
        if (misdetectedUTF8(body)) {
#ifdef DEBUG_browserOnLoadHandler
          jsConsoleService.logStringMessage("confirm misdetected utf-8; setting charset to utf-8");
#endif
          MessengerSetForcedCharacterSet("utf-8");
          return;
        }
        else {
#ifdef DEBUG_browserOnLoadHandler
          jsConsoleService.logStringMessage("reject utf8; not setting charset to utf-8");
#endif
        }
      }
    }
  }
  else {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("not considering charset change");
#endif
  }

  gMessageURI = loadedMessageURI;

#ifdef DEBUG_browserOnLoadHandler
  jsConsoleService.logStringMessage("completed charset phase");
#endif

  // quote bar css
  var head = domDocument.getElementsByTagName("head")[0];
  if (head) {
    var newSS = domDocument.createElement("link");
    newSS.rel  = "stylesheet";
    newSS.type = "text/css";
    newSS.href = "chrome://bidimailpack/content/quotebar.css";
    head.appendChild(newSS);
  }

#ifdef DEBUG
  // be careful: we may be matching some elements twice in the following code! Check this!
#endif

  // Auto detect the message direction
  if (!gBDMPrefs.getBoolPref("display.autodetect_direction", true))
    return;

  if (directionPref) {
#ifdef DEBUG_browserOnLoadHandler
    jsConsoleService.logStringMessage("elementsRequiringExplicitDirection.length = " + elementsRequiringExplicitDirection.length);
#endif
 
    for (i=0  ; i < elementsRequiringExplicitDirection.length; i++) {
      var node = elementsRequiringExplicitDirection[i];
   
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage('elementsRequiringExplicitDirection[ ' + i + ']: ' + node + "\ntype: " + node.nodeType + "\nclassName: " + node.className + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
        // Auto detect the subbody direction
      if (!node)
        continue;
      if ( (node!=body) && !(/^moz-text/.test(node.className))) 
        continue;
        
      if (node == body) {
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage("loadedMessageURI = " + loadedMessageURI);
#endif
        var messageHeader;
        try {
          messageHeader = messenger.msgHdrFromURI(loadedMessageURI);
        }
        catch(ex) {
#ifdef DEBUG_browserOnLoadHandler
          jsConsoleService.logStringMessage("couldn't get header:" + ex);
#endif
        }
#ifdef DEBUG_browserOnLoadHandler
        jsConsoleService.logStringMessage("messageHeader =" + messageHeader);
#endif
        try {
          var directionProperty = messageHeader.getStringProperty(MSFDirectionProperty);

          if (directionProperty == "rtl" || directionProperty == "ltr") {
#ifdef DEBUG_SetMessageDirection
            jsConsoleService.logStringMessage("setting direction by property to " + directionProperty);
#endif
            SetMessageDirection(directionProperty,false);
            continue;
          }
#ifdef DEBUG_SetMessageDirection
          else 
            jsConsoleService.logStringMessage("NOT setting direction by property: " + directionProperty);
#endif
        }
        catch(ex) {
#ifdef DEBUG_browserOnLoadHandler
          jsConsoleService.logStringMessage("couldn't get direction property:" + ex);
#endif
        }
      }
      
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage("considering direction change?");
#endif
      var detectedDirection = (canBeAssumedRTL(node,directionDetectionRTLSequence) ? "rtl" : "ltr");
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage("canBeAssumedRTL(elementsRequiringExplicitDirection[i],rtlSequence) -> " + (detectedDirection == "rtl") );
#endif
      if (node == body)
        SetMessageDirection(detectedDirection, true)
      else
        node.style.direction = detectedDirection;
    }
  }

#ifdef MOZ_THUNDERBIRD
  var currentDirection =
    window.getComputedStyle(body, null).direction;
  UpdateDirectionButtons(currentDirection);
#endif
}

function InstallBrowserHandler()
{
  var browser = getMessageBrowser();
  if (browser)
    browser.addEventListener("load", browserOnLoadHandler, true);
}

