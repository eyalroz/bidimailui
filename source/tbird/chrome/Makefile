JAR_FILENAME=bidimailpack.jar
.PHONY: all clean ${JAR_FILENAME}

all: ${JAR_FILENAME}

clean:
	rm ${JAR_FILENAME} 2>/dev/null; true

${JAR_FILENAME}: content locale skin
	rm $@ 2>/dev/null; zip $@ -r $^ -x '*/CVS/*'
