// Summary of differences from tbird version:
//
// none, for now!

function hasRTLWord(element) {
  // we check whether there exists a full word in the element text
  // consisting solely of characters of an RTL script

  // 0x0591 to 0x05F4 is the range of Hebrew characters (basic letters are 0x05D0 - 0x5EA),
  // 0x060C to 0x06F9 is the range of Arabic characters
  var re = /(^|\s|[<>])([\u0591-\u05F4]+|[\u060C-\u06F9]+)($|\s|[<>])/;

  try {
    var iterator = new XPathEvaluator();
    var path = iterator.evaluate("//text()", element, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    for (var node = path.iterateNext(); node; node = path.iterateNext())
    {
      if (re.test(node.data))
      return true;
    }
  } catch (e) {
    // 'new XPathEvaluator()' doesn't work in Thunderbird for some reason,
    // so we do:
    if (re.test(element.innerHTML))
      return true;
  }
  return false;
}
