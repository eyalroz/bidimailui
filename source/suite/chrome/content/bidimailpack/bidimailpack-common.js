// Summary of differences from tbird version:
//
// - We do not set a document attribute which affects the behavior
//   of the default theme, so no LoadOSAttributeOnWindow() function

function canBeAssumedRTL(element) {

  // we check whether there exists a line which either begins
  // with a word consisting solely of characters of an RTL script,
  // or ends with two such words (excluding any punctuation/spacing/
  // numbering at the beginnings and ends of lines)

  // we use definitions from nsBiDiUtils.h as the criteria for BiDi text;
  // cf. the macros IS_IN_BMP_RTL_BLOCK and IS_RTL_PRESENTATION_FORM

  var rtlSequence = "([\\u0590-\\u08FF]|[\\uFB1D-\\uFDFF]|[\\uFE70-\\uFEFC])+";

  try {

    var ignore = "(\\s|[<>\\.;,:0-9\"'])";
    var re = new RegExp ("(^" + ignore + "*" + rtlSequence + ")|(" +
                         rtlSequence + ignore + "+" + rtlSequence + ignore + "*$)");


    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("//text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (re.test(node.data))
      return true;
    }
  } catch (e) {
    // 'new XPathEvaluator()' doesn't work for some reason, so we have
    // to test the HTMLized message rather than the bare text lines;
    // the regexp must change accordingly
    
    var ignore = "(\\s|[\\.;,:0-9']|&lt;|&gt;|&amp;|&quot;)";
    var re = new RegExp ("((^|>)" + ignore + "*" + rtlSequence + ")|(" +
                         rtlSequence + ignore + "+" + rtlSequence + ignore + "*($|<))");
    
    if (re.test(element.innerHTML))
      return true;
  }
  return false;
}
