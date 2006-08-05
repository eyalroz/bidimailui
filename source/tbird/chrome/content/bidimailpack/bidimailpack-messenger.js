#ifdef DEBUG
// The following 2 lines enable logging messages to the javascript console:
var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

// Here is an example of a console log message describing a DOM node:
// jsConsoleService.logStringMessage('visiting node: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif

// workaround for bug 12469
var gMessageURI = null;

function GetMessageContentElement(domDoc) {
  if (!domDoc)
    throw("Called GetMessageContentElement with no document");

  var bodyElement = domDoc.body;
  if (!bodyElement)
    throw("Cannot get the message content element without a body element");

  // Try to find the DIV element which contains the message content
  var firstSubBody = null;
  var elementsRequiringExplicitDirection = bodyElement.getElementsByTagName("div");
  for (var i = 0; i < elementsRequiringExplicitDirection.length && !firstSubBody; i++) {
    if (/^moz-text/.test(elementsRequiringExplicitDirection[i].className))
      firstSubBody = elementsRequiringExplicitDirection[i];
  }

  // If there's no such element, the meesage content element is inside
  // the body element itself
  return (firstSubBody || bodyElement);
}

function SetMessageDirection(dir)
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

  messageContentElement.style.direction = dir;

#ifdef MOZ_THUNDERBIRD
  UpdateDirectionButtons(dir);
#endif
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

  var currentDirection =
    window.getComputedStyle(messageContentElement, null).direction;
  var oppositeDirection = currentDirection == "ltr" ? "rtl" : "ltr";
  messageContentElement.style.direction = oppositeDirection;
#ifdef MOZ_THUNDERBIRD
  UpdateDirectionButtons(oppositeDirection);
#endif
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
  jsConsoleService.logStringMessage("------------------------------\nbrowserOnLoadHandler()");
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
    charsetPref =
      gBDMPrefs.prefService.getCharPref("mailnews.view_default_charset");
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

  var rtlSequence;
  if (charsetPref == "windows-1255") // Hebrew, windows-1255
    rtlSequence = "([\\u0590-\\u05FF]|[\\uFB1D-\\uFB4F]){3,}";
  else  // Arabic, windows-1256
    rtlSequence = "([\\u0600-\\u06FF]|[\\uFB50-\\uFDFF]|[\\uFE70-\\uFEFC]){3,}";

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
        if (misdetectedRTLCodePage(body,rtlSequence)) {
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
      if ( !( (node==body) || (/^moz-text/.test(node.className))) )
        continue;
   
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage("considering direction change?");
#endif
      var res = canBeAssumedRTL(node,rtlSequence);
#ifdef DEBUG_browserOnLoadHandler
      jsConsoleService.logStringMessage("canBeAssumedRTL(elementsRequiringExplicitDirection[i],rtlSequence) = " + res + "\nset node.dir to " + (res ? "rtl" : "ltr") );
#endif
      node.setAttribute("dir", (res ? "rtl" : "ltr") );
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
