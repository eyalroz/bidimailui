.PHONY: all clean bidimailpack.jar

all: bidimailpack.jar

clean:
	rm bidimailpack.jar 2>/dev/null; true

bidimailpack.jar: content locale skin
	rm $@ 2>/dev/null; zip $@ -r $^ -x '*/CVS/*'
