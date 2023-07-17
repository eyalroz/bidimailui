# BiDI Mail UI: Improved bidirectional & Right-to-Left language support for Thunderbird

<sub>([See it also on `addons.thunderbird.net`](https://addons.thunderbird.net/thunderbird/addon/bidi-mail-ui/))</sub>

So, you use the Thunderbird mail client, and you send or receive email in a right-to-left (RTL) language, such as Arabic, Farsi or Hebrew. Thunderbird is based on Mozilla/Firefox, and Firefox supports webpages in those languages, right? So, surely Thunderbird must have bidirectional capabilities and support, right? Wrong :-(

* The text emails you receive are always rendered in left-to-right (LTR) direction, regardless of their langauge
* ... and so are the HTML messages, if they don't have explicit direction settings/
* When you compose messages, it's the same thing: The composition window assumes you're writing LTR content only.
* And let's not even talk about setting directions on a paragraph-by-paragraph level! None of that.
* Sometimes, you receive emails with Arabic/Farsi/Hebrew content, which show up as gibberish, because Thunderbird didn't correctly determine their character set encoding - and you have to set it manually.
* ... and if you have a message with text in more than one character set encoding, you're out of luck, because you can only choose exactly one encoding for the whole message.

If any of this has bothered you - then BiDi Mail UI is the (imperfect) solution to your problems!

## Key features

The BiDi Mail UI extension adds functionality both for reading and composing mail (and news) messages.

**Reading**:

* Detects many cases in which Mozilla mis-decodes a message in one of the bidirectional language charsets, and chooses the proper encoding
* Decodes Bidirectional language text in mixed-charset messages (UTF-8 and windows-1255/6)
* Detects the intended directions of mail messages and displays them in this direction
* Detects the intended directions of individual paragraphs within mail messages and lays out the message accordingly

**Composition**:

* Allows setting the direction of the entire message
* Allows setting the direction of individual paragraphs in HTML mail
* Allows insertion of LRM/RLM marks, via menus or using Ctrl+Shift+L/Ctrl+Shift+R

## The extension in action

![bidimailui in action](https://github.com/eyalroz/bidimailui/blob/master/.github/images/basic-screenshot.png?raw=true)

This screenshot was taken with Thunderbird 68.8.0 on [Devuan GNU/Linux](https://www.devuan.org/) Beowulf, with BiDi Mail UI 0.10. *Note:* The message in the background of the composition window is a *plain text message*; its paragraph directions were set automatically by the extension.

## <a name="origins"> Origins of the extension

BiDi Mail UI was originally based on an old extension by 
[Moofie](http://www.typo.co.il/~mooffie/), called HebMailPack;
it was developed in order to fix Mozilla's 
[Bug 119857](http://bugzilla.mozilla.org/show_bug.cgi?id=119857).
Eventually, it was completely rewritten, with much functionality added and improved.

For a long while, the extension was developed and maintained by Eyal Rozenberg and Asaf Romano on [MozDev](http://www.mozdev.org/); Asaf eventually retired from maintenance, and several years later, MozDev wound down. Eyal, the current maintainer, migrated the extension to GitHub.

See also the Credits page on the repository wiki.

## <a name="feedback"> Bugs, suggestions, feedback, etc.

Read the [FAQ section of the wiki](https://github.com/eyalroz/removedupes/wiki/FAQ-(Frequently-Asked-Questions)); your answer is probably in there. If it isn't, please search the [issues page](https://github.com/eyalroz/removedupes/issues) of this repository, to check if it's already been reported. not, file a new issue. 

If you'd like to give some personal feedback about the extension and/or the state of Thunderbird in general - you can [write the maintainer](mailto:eyalroz1@gmx.com).

