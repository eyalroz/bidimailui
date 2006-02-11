// The following 3 lines enable logging messages to the javascript console:
//
// netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect');
// var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
// jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);
//
// here is an example of a console log message describing a DOM node:
// jsConsoleService.logStringMessage('visiting node: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nHTML:\n" + node.innerHTML + "\nOuter HTML:\n" + node.innerHTML + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);

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
  var possibleSubBodies = bodyElement.getElementsByTagName("div");
  for (var i = 0; i < possibleSubBodies.length && !firstSubBody; i++) {
    if (/^moz-text/.test(possibleSubBodies[i].className))
      firstSubBody = possibleSubBodies[i];
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
  var domDoc;
  try {
    domDoc = this.docShell.contentViewer.DOMDocument;
  }
  catch (ex) {
    dump(ex);
    return;
  }

  var body = domDoc.body;
  if (!body)
    return;

  // quote bar css
  var head = domDoc.getElementsByTagName("head")[0];
  if (head) {
    var newSS = domDoc.createElement("link");
    newSS.rel  = "stylesheet";
    newSS.type = "text/css";
    newSS.href = "chrome://bidimailpack/content/quotebar.css";
    head.appendChild(newSS);
  }

  /*
   * Auto-detect some mis-decoded messages:
   * When shall we attempt re-detection and overriding of the character set?
   * not if the encoding has _already_ been overridden (either due to the pref
   * or not) and not if the default charset is not one of the 256-char codepages
   * we expect get mangled, and then only when the charset is reported as one of
   * the defaultish ones (or not reported at all)?
   * Notes:
   * - We don't detect 'false positives' (e.g. we won't detect when a message
   *   which isn't supposed to be windows-1255 has been made windows-1255)
   * - Changing the charset here means that the message is re-loaded, which
   *   calls this function (the onLoad handler) again
   */
  var charsetPref = null;
  try {
    charsetPref =
      gBDMPrefs.prefService.getCharPref("mailnews.view_default_charset");
  }
  catch (ex) { }

  var msgWindow = Components.classes[msgWindowContractID].createInstance();
  msgWindow = msgWindow.QueryInterface(Components.interfaces.nsIMsgWindow);
  if (charsetPref && msgWindow) {
    loadedMessageURI = GetLoadedMessage();
    if (loadedMessageURI != gMessageURI) {
      gMessageURI = loadedMessageURI;
      var misdecodeAutodetectPref =
        gBDMPrefs.getBoolPref("display.autodetect_bidi_misdecoding", true);
      if ( misdecodeAutodetectPref &&
           !msgWindow.charsetOverride &&
           (!msgWindow.mailCharacterSet ||
            msgWindow.mailCharacterSet == "US-ASCII" ||
            msgWindow.mailCharacterSet == "ISO-8859-1" ||
            msgWindow.mailCharacterSet == "windows-1252" ||
            msgWindow.mailCharacterSet == "") ) {
        var isMisdetectedRTLCodePage = false;
        if (charsetPref == "windows-1255" || charsetPref == "windows-1256") {
          //jsConsoleService.logStringMessage("checking codepage");
          isMisdetectedRTLCodePage = misdetectedRTLCodePage(body);
        } else {
          //jsConsoleService.logStringMessage("not checking codepage after all");
        }

        if (isMisdetectedRTLCodePage) {
          //jsConsoleService.logStringMessage("setting codepage");
          MessengerSetForcedCharacterSet(charsetPref);
        }
        else { 
          //jsConsoleService.logStringMessage("reject codepage");
          if(misdetectedUTF8(body)) {
            //jsConsoleService.logStringMessage("confirm utf8");
            MessengerSetForcedCharacterSet("utf-8");
          }
          else {
            //jsConsoleService.logStringMessage("reject utf8");
          }
        }

      }

    }
  } 

  // Auto detect the message direction
  if (!gBDMPrefs.getBoolPref("display.autodetect_direction", true))
    return;

  // Find the DIV element which contains the message content
  var firstSubBody = null;
  var possibleSubBodies = body.getElementsByTagName("div");
  for (var i = 0; i < possibleSubBodies.length && !firstSubBody; i++) {
    if (/^moz-text/.test(possibleSubBodies[i].className))
      firstSubBody = possibleSubBodies[i];
  }

  /* 
   * The first "sub body" element is the message content element
   * note the attributes of the orginal body element are set
   * on the body element.
   *
   * If the message content element couldn't be found, we use the
   * body element itself.
   */
  if (!body.hasAttribute("dir") &&
      window.getComputedStyle(body, null).direction == "ltr" &&
      canBeAssumedRTL(firstSubBody || body)) {
    /*
     * The body has no DIR attribute and isn't already set to be RTLed,
     * but it looks RTLish, so let's add an initial stylesheet saying it's RTL,
     * which will be overridden by any other stylesheets within 
     * the document itself
     */
    if (head) {
      var newSS  = domDoc.createElement("link");
      newSS.rel  = "stylesheet";
      newSS.type = "text/css";
      newSS.href = "chrome://bidimailpack/content/weakrtl.css";
      if (head.firstChild)
        head.insertBefore(newSS,head.firstChild);
      else
        head.appendChild(newSS);
    }
  }
#ifdef MOZ_THUNDERBIRD
  var currentDirection =
    window.getComputedStyle(firstSubBody || body, null).direction;
  UpdateDirectionButtons(currentDirection);
#endif

  // Autodetect the direction of any remaining "sub body"
  for ( ; i < possibleSubBodies.length; i++) {
    if (/^moz-text/.test(possibleSubBodies[i].className)) {
      possibleSubBodies[i].dir = canBeAssumedRTL(possibleSubBodies[i]) ?
                                 "rtl" : "ltr";
    }
  }
}

function InstallBrowserHandler()
{
  var browser = getMessageBrowser();
  if (browser)
    browser.addEventListener("load", browserOnLoadHandler, true);
}
