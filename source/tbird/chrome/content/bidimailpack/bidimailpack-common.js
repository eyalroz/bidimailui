// Common Globals
var gPrefService = null;

function misdetectedRTLCodePage(element)
{
  var misdetectedCodePageSequence = "([\\u00BF-\\u00FF]{2,}|\\uFFFD{2,})";
  var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])";
  var normalExpression = new RegExp ("(^|" + normalIgnore + "+)" + misdetectedCodePageSequence + "("+ normalIgnore + "+|$)");

  var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)";
  var htmlizedExpression = new RegExp ("((^|>)|" + htmlizedIgnore + "+)" + misdetectedCodePageSequence + "(" + htmlizedIgnore  + "($|<))");
  return matchInText(element, normalExpression, htmlizedExpression);
}

function canBeAssumedRTL(element)
{
  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  // we use definitions from nsBiDiUtils.h as the criteria for BiDi text;
  // cf. the macros IS_IN_BMP_RTL_BLOCK and IS_RTL_PRESENTATION_FORM

  var rtlSequence = "([\\u0590-\\u08FF]|[\\uFB1D-\\uFDFF]|[\\uFE70-\\uFEFC])+";
  var normalIgnore = "(\\s|[<>\\.;,:0-9\"'])";
  var normalExpression = new RegExp ("(^" + normalIgnore + "*" + rtlSequence + ")|(" +
                         rtlSequence + normalIgnore + "+" + rtlSequence + normalIgnore + "*$)");

  var htmlizedIgnore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)";
  var htmlizedExpression = new RegExp ("((^|>)" + htmlizedIgnore + "*" + rtlSequence + ")|(" +
                       rtlSequence + htmlizedIgnore + "+" + rtlSequence + htmlizedIgnore + "*($|<))");
  return matchInText(element, normalExpression, htmlizedExpression);
}

function matchInText(element, normalExpression, htmlizedExpression)
{
  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("//text()", element, null,
                                 XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (normalExpression.test(node.data))
      return true;
    }
  }
  catch (ex) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we have
    // to test the HTMLized message rather than the bare text lines;
    // the regexp must change accordingly
    
    if (htmlizedExpression.test(element.innerHTML))
      return true;
  }
  return false;
}

function LoadOSAttributeOnWindow()
{
  // We use different style rules on mac
  document.documentElement
          .setAttribute("system",
                        /Mac/.test(navigator.platform) ? "mac" : "not_mac");
}

// Prefs helpers
function LoadPrefService()
{
  gPrefService = Components.classes["@mozilla.org/preferences-service;1"]
                           .getService(Components.interfaces.nsIPrefBranch);
}

function GetBoolPrefWithDefault(prefname, defaultValue)
{
  try {
    if (!gPrefService)
      LoadPrefService();

    return gPrefService.getBoolPref(prefname);
  }
  catch (ex) {
    return defaultValue;
  }
}

function GetCharPrefWithDefault(prefname, defaultValue)
{
  try {
    if (!gPrefService)
      LoadPrefService();

    return gPrefService.getCharPref(prefname);
  }
  catch (ex) {
    return defaultValue;
  }
}
