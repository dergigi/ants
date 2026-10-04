grammar AntsQuery;

// No target-specific actions: this grammar also generates Java for Android.
query: expression EOF;
expression: conjunction (OR conjunction)*;
conjunction: primary (AND? primary)*;
primary
    : WORD COLON LPAREN expression RPAREN # scopedField
    | WORD COLON value                    # field
    | LPAREN expression RPAREN            # group
    | STRING                              # phrase
    | WORD                                # term
    ;
value: STRING | WORD (COLON WORD?)*;
OR: [oO][rR];
AND: [aA][nN][dD];
NOT: [nN][oO][tT]; // Reserved until execution semantics are defined.
LPAREN: '(';
RPAREN: ')';
COLON: ':';
STRING: '"' ('\\' ["\\] | ~["\\\r\n])* '"';
WORD: ~[ \t\r\n():"\\]+;
WS: [ \t\r\n]+ -> skip;
