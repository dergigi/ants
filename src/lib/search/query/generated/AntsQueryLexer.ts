// Generated from grammar/AntsQuery.g4 by ANTLR 4.13.2
// noinspection ES6UnusedImports,JSUnusedGlobalSymbols,JSUnusedLocalSymbols
import {
    ATN,
    ATNDeserializer,
    CharStream,
    DecisionState, DFA,
    Lexer,
    LexerATNSimulator,
    RuleContext,
    PredictionContextCache,
    Token
} from "antlr4";
export default class AntsQueryLexer extends Lexer {
    public static readonly OR = 1;
    public static readonly AND = 2;
    public static readonly NOT = 3;
    public static readonly LPAREN = 4;
    public static readonly RPAREN = 5;
    public static readonly COLON = 6;
    public static readonly STRING = 7;
    public static readonly WORD = 8;
    public static readonly WS = 9;
    public static readonly EOF = Token.EOF;

    public static readonly channelNames: string[] = [ "DEFAULT_TOKEN_CHANNEL", "HIDDEN" ];
    public static readonly literalNames: (string | null)[] = [ null, null,
                                                            null, null,
                                                            "'('", "')'",
                                                            "':'" ];
    public static readonly symbolicNames: (string | null)[] = [ null, "OR",
                                                             "AND", "NOT",
                                                             "LPAREN", "RPAREN",
                                                             "COLON", "STRING",
                                                             "WORD", "WS" ];
    public static readonly modeNames: string[] = [ "DEFAULT_MODE", ];

    public static readonly ruleNames: string[] = [
        "OR", "AND", "NOT", "LPAREN", "RPAREN", "COLON", "STRING", "WORD", "WS",
    ];


    constructor(input: CharStream) {
        super(input);
        this._interp = new LexerATNSimulator(this, AntsQueryLexer._ATN, AntsQueryLexer.DecisionsToDFA, new PredictionContextCache());
    }

    public get grammarFileName(): string { return "AntsQuery.g4"; }

    public get literalNames(): (string | null)[] { return AntsQueryLexer.literalNames; }
    public get symbolicNames(): (string | null)[] { return AntsQueryLexer.symbolicNames; }
    public get ruleNames(): string[] { return AntsQueryLexer.ruleNames; }

    public get serializedATN(): number[] { return AntsQueryLexer._serializedATN; }

    public get channelNames(): string[] { return AntsQueryLexer.channelNames; }

    public get modeNames(): string[] { return AntsQueryLexer.modeNames; }

    public static readonly _serializedATN: number[] = [4,0,9,59,6,-1,2,0,7,
    0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,1,0,1,
    0,1,0,1,1,1,1,1,1,1,1,1,2,1,2,1,2,1,2,1,3,1,3,1,4,1,4,1,5,1,5,1,6,1,6,1,
    6,1,6,5,6,41,8,6,10,6,12,6,44,9,6,1,6,1,6,1,7,4,7,49,8,7,11,7,12,7,50,1,
    8,4,8,54,8,8,11,8,12,8,55,1,8,1,8,0,0,9,1,1,3,2,5,3,7,4,9,5,11,6,13,7,15,
    8,17,9,1,0,10,2,0,79,79,111,111,2,0,82,82,114,114,2,0,65,65,97,97,2,0,78,
    78,110,110,2,0,68,68,100,100,2,0,84,84,116,116,2,0,34,34,92,92,4,0,10,10,
    13,13,34,34,92,92,7,0,9,10,13,13,32,32,34,34,40,41,58,58,92,92,3,0,9,10,
    13,13,32,32,62,0,1,1,0,0,0,0,3,1,0,0,0,0,5,1,0,0,0,0,7,1,0,0,0,0,9,1,0,
    0,0,0,11,1,0,0,0,0,13,1,0,0,0,0,15,1,0,0,0,0,17,1,0,0,0,1,19,1,0,0,0,3,
    22,1,0,0,0,5,26,1,0,0,0,7,30,1,0,0,0,9,32,1,0,0,0,11,34,1,0,0,0,13,36,1,
    0,0,0,15,48,1,0,0,0,17,53,1,0,0,0,19,20,7,0,0,0,20,21,7,1,0,0,21,2,1,0,
    0,0,22,23,7,2,0,0,23,24,7,3,0,0,24,25,7,4,0,0,25,4,1,0,0,0,26,27,7,3,0,
    0,27,28,7,0,0,0,28,29,7,5,0,0,29,6,1,0,0,0,30,31,5,40,0,0,31,8,1,0,0,0,
    32,33,5,41,0,0,33,10,1,0,0,0,34,35,5,58,0,0,35,12,1,0,0,0,36,42,5,34,0,
    0,37,38,5,92,0,0,38,41,7,6,0,0,39,41,8,7,0,0,40,37,1,0,0,0,40,39,1,0,0,
    0,41,44,1,0,0,0,42,40,1,0,0,0,42,43,1,0,0,0,43,45,1,0,0,0,44,42,1,0,0,0,
    45,46,5,34,0,0,46,14,1,0,0,0,47,49,8,8,0,0,48,47,1,0,0,0,49,50,1,0,0,0,
    50,48,1,0,0,0,50,51,1,0,0,0,51,16,1,0,0,0,52,54,7,9,0,0,53,52,1,0,0,0,54,
    55,1,0,0,0,55,53,1,0,0,0,55,56,1,0,0,0,56,57,1,0,0,0,57,58,6,8,0,0,58,18,
    1,0,0,0,5,0,40,42,50,55,1,6,0,0];

    private static __ATN: ATN;
    public static get _ATN(): ATN {
        if (!AntsQueryLexer.__ATN) {
            AntsQueryLexer.__ATN = new ATNDeserializer().deserialize(AntsQueryLexer._serializedATN);
        }

        return AntsQueryLexer.__ATN;
    }


    static DecisionsToDFA = AntsQueryLexer._ATN.decisionToState.map( (ds: DecisionState, index: number) => new DFA(ds, index) );
}