.PHONY: all clean bidiext.jar

all: bidiext.jar

clean:
	rm bidiext.jar 2>/dev/null; true

bidiext.jar: content locale
	rm $@ 2>/dev/null; zip $@ -r $^ -x '*/CVS/*'
