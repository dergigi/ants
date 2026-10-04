// Generated from grammar/AntsQuery.g4 by ANTLR 4.13.2
// noinspection ES6UnusedImports,JSUnusedGlobalSymbols,JSUnusedLocalSymbols

import {
    ATN,
    ATNDeserializer, DecisionState, DFA, FailedPredicateException,
    RecognitionException, NoViableAltException, BailErrorStrategy,
    Parser, ParserATNSimulator,
    RuleContext, ParserRuleContext, PredictionMode, PredictionContextCache,
    TerminalNode, RuleNode,
    Token, TokenStream,
    Interval, IntervalSet
} from 'antlr4';
// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;

export default class AntsQueryParser extends Parser {
    public static readonly OR = 1;
    public static readonly AND = 2;
    public static readonly NOT = 3;
    public static readonly LPAREN = 4;
    public static readonly RPAREN = 5;
    public static readonly COLON = 6;
    public static readonly STRING = 7;
    public static readonly WORD = 8;
    public static readonly WS = 9;
    public static override readonly EOF = Token.EOF;
    public static readonly RULE_query = 0;
    public static readonly RULE_expression = 1;
    public static readonly RULE_conjunction = 2;
    public static readonly RULE_primary = 3;
    public static readonly RULE_value = 4;
    public static readonly literalNames: (string | null)[] = [ null, null,
                                                            null, null,
                                                            "'('", "')'",
                                                            "':'" ];
    public static readonly symbolicNames: (string | null)[] = [ null, "OR",
                                                             "AND", "NOT",
                                                             "LPAREN", "RPAREN",
                                                             "COLON", "STRING",
                                                             "WORD", "WS" ];
    // tslint:disable:no-trailing-whitespace
    public static readonly ruleNames: string[] = [
        "query", "expression", "conjunction", "primary", "value",
    ];
    public get grammarFileName(): string { return "AntsQuery.g4"; }
    public get literalNames(): (string | null)[] { return AntsQueryParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return AntsQueryParser.symbolicNames; }
    public get ruleNames(): string[] { return AntsQueryParser.ruleNames; }
    public get serializedATN(): number[] { return AntsQueryParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
        return new FailedPredicateException(this, predicate, message);
    }

    constructor(input: TokenStream) {
        super(input);
        this._interp = new ParserATNSimulator(this, AntsQueryParser._ATN, AntsQueryParser.DecisionsToDFA, new PredictionContextCache());
    }
    // @RuleVersion(0)
    public query(): QueryContext {
        let localctx: QueryContext = new QueryContext(this, this._ctx, this.state);
        this.enterRule(localctx, 0, AntsQueryParser.RULE_query);
        try {
            this.enterOuterAlt(localctx, 1);
            {
            this.state = 10;
            this.expression();
            this.state = 11;
            this.match(AntsQueryParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException) {
                localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localctx;
    }
    // @RuleVersion(0)
    public expression(): ExpressionContext {
        let localctx: ExpressionContext = new ExpressionContext(this, this._ctx, this.state);
        this.enterRule(localctx, 2, AntsQueryParser.RULE_expression);
        let _la: number;
        try {
            this.enterOuterAlt(localctx, 1);
            {
            this.state = 13;
            this.conjunction();
            this.state = 18;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while (_la===1) {
                {
                {
                this.state = 14;
                this.match(AntsQueryParser.OR);
                this.state = 15;
                this.conjunction();
                }
                }
                this.state = 20;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException) {
                localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localctx;
    }
    // @RuleVersion(0)
    public conjunction(): ConjunctionContext {
        let localctx: ConjunctionContext = new ConjunctionContext(this, this._ctx, this.state);
        this.enterRule(localctx, 4, AntsQueryParser.RULE_conjunction);
        let _la: number;
        try {
            this.enterOuterAlt(localctx, 1);
            {
            this.state = 21;
            this.primary();
            this.state = 28;
            this._errHandler.sync(this);
            _la = this._input.LA(1);
            while ((((_la) & ~0x1F) === 0 && ((1 << _la) & 404) !== 0)) {
                {
                {
                this.state = 23;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
                if (_la===2) {
                    {
                    this.state = 22;
                    this.match(AntsQueryParser.AND);
                    }
                }

                this.state = 25;
                this.primary();
                }
                }
                this.state = 30;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof RecognitionException) {
                localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localctx;
    }
    // @RuleVersion(0)
    public primary(): PrimaryContext {
        let localctx: PrimaryContext = new PrimaryContext(this, this._ctx, this.state);
        this.enterRule(localctx, 6, AntsQueryParser.RULE_primary);
        try {
            this.state = 46;
            this._errHandler.sync(this);
            switch ( this._interp.adaptivePredict(this._input, 3, this._ctx) ) {
            case 1:
                localctx = new ScopedFieldContext(this, localctx);
                this.enterOuterAlt(localctx, 1);
                {
                this.state = 31;
                this.match(AntsQueryParser.WORD);
                this.state = 32;
                this.match(AntsQueryParser.COLON);
                this.state = 33;
                this.match(AntsQueryParser.LPAREN);
                this.state = 34;
                this.expression();
                this.state = 35;
                this.match(AntsQueryParser.RPAREN);
                }
                break;
            case 2:
                localctx = new FieldContext(this, localctx);
                this.enterOuterAlt(localctx, 2);
                {
                this.state = 37;
                this.match(AntsQueryParser.WORD);
                this.state = 38;
                this.match(AntsQueryParser.COLON);
                this.state = 39;
                this.value();
                }
                break;
            case 3:
                localctx = new GroupContext(this, localctx);
                this.enterOuterAlt(localctx, 3);
                {
                this.state = 40;
                this.match(AntsQueryParser.LPAREN);
                this.state = 41;
                this.expression();
                this.state = 42;
                this.match(AntsQueryParser.RPAREN);
                }
                break;
            case 4:
                localctx = new PhraseContext(this, localctx);
                this.enterOuterAlt(localctx, 4);
                {
                this.state = 44;
                this.match(AntsQueryParser.STRING);
                }
                break;
            case 5:
                localctx = new TermContext(this, localctx);
                this.enterOuterAlt(localctx, 5);
                {
                this.state = 45;
                this.match(AntsQueryParser.WORD);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof RecognitionException) {
                localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localctx;
    }
    // @RuleVersion(0)
    public value(): ValueContext {
        let localctx: ValueContext = new ValueContext(this, this._ctx, this.state);
        this.enterRule(localctx, 8, AntsQueryParser.RULE_value);
        let _la: number;
        try {
            this.state = 59;
            this._errHandler.sync(this);
            switch (this._input.LA(1)) {
            case 7:
                this.enterOuterAlt(localctx, 1);
                {
                this.state = 48;
                this.match(AntsQueryParser.STRING);
                }
                break;
            case 8:
                this.enterOuterAlt(localctx, 2);
                {
                this.state = 49;
                this.match(AntsQueryParser.WORD);
                this.state = 56;
                this._errHandler.sync(this);
                _la = this._input.LA(1);
                while (_la===6) {
                    {
                    {
                    this.state = 50;
                    this.match(AntsQueryParser.COLON);
                    this.state = 52;
                    this._errHandler.sync(this);
                    switch ( this._interp.adaptivePredict(this._input, 4, this._ctx) ) {
                    case 1:
                        {
                        this.state = 51;
                        this.match(AntsQueryParser.WORD);
                        }
                        break;
                    }
                    }
                    }
                    this.state = 58;
                    this._errHandler.sync(this);
                    _la = this._input.LA(1);
                }
                }
                break;
            default:
                throw new NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof RecognitionException) {
                localctx.exception = re;
                this._errHandler.reportError(this, re);
                this._errHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localctx;
    }

    public static readonly _serializedATN: number[] = [4,1,9,62,2,0,7,0,2,1,
    7,1,2,2,7,2,2,3,7,3,2,4,7,4,1,0,1,0,1,0,1,1,1,1,1,1,5,1,17,8,1,10,1,12,
    1,20,9,1,1,2,1,2,3,2,24,8,2,1,2,5,2,27,8,2,10,2,12,2,30,9,2,1,3,1,3,1,3,
    1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,47,8,3,1,4,1,4,1,4,
    1,4,3,4,53,8,4,5,4,55,8,4,10,4,12,4,58,9,4,3,4,60,8,4,1,4,0,0,5,0,2,4,6,
    8,0,0,66,0,10,1,0,0,0,2,13,1,0,0,0,4,21,1,0,0,0,6,46,1,0,0,0,8,59,1,0,0,
    0,10,11,3,2,1,0,11,12,5,0,0,1,12,1,1,0,0,0,13,18,3,4,2,0,14,15,5,1,0,0,
    15,17,3,4,2,0,16,14,1,0,0,0,17,20,1,0,0,0,18,16,1,0,0,0,18,19,1,0,0,0,19,
    3,1,0,0,0,20,18,1,0,0,0,21,28,3,6,3,0,22,24,5,2,0,0,23,22,1,0,0,0,23,24,
    1,0,0,0,24,25,1,0,0,0,25,27,3,6,3,0,26,23,1,0,0,0,27,30,1,0,0,0,28,26,1,
    0,0,0,28,29,1,0,0,0,29,5,1,0,0,0,30,28,1,0,0,0,31,32,5,8,0,0,32,33,5,6,
    0,0,33,34,5,4,0,0,34,35,3,2,1,0,35,36,5,5,0,0,36,47,1,0,0,0,37,38,5,8,0,
    0,38,39,5,6,0,0,39,47,3,8,4,0,40,41,5,4,0,0,41,42,3,2,1,0,42,43,5,5,0,0,
    43,47,1,0,0,0,44,47,5,7,0,0,45,47,5,8,0,0,46,31,1,0,0,0,46,37,1,0,0,0,46,
    40,1,0,0,0,46,44,1,0,0,0,46,45,1,0,0,0,47,7,1,0,0,0,48,60,5,7,0,0,49,56,
    5,8,0,0,50,52,5,6,0,0,51,53,5,8,0,0,52,51,1,0,0,0,52,53,1,0,0,0,53,55,1,
    0,0,0,54,50,1,0,0,0,55,58,1,0,0,0,56,54,1,0,0,0,56,57,1,0,0,0,57,60,1,0,
    0,0,58,56,1,0,0,0,59,48,1,0,0,0,59,49,1,0,0,0,60,9,1,0,0,0,7,18,23,28,46,
    52,56,59];

    private static __ATN: ATN;
    public static get _ATN(): ATN {
        if (!AntsQueryParser.__ATN) {
            AntsQueryParser.__ATN = new ATNDeserializer().deserialize(AntsQueryParser._serializedATN);
        }

        return AntsQueryParser.__ATN;
    }


    static DecisionsToDFA = AntsQueryParser._ATN.decisionToState.map( (ds: DecisionState, index: number) => new DFA(ds, index) );

}

export class QueryContext extends ParserRuleContext {
    constructor(parser?: AntsQueryParser, parent?: ParserRuleContext, invokingState?: number) {
        super(parent, invokingState);
        this.parser = parser;
    }
    public expression(): ExpressionContext {
        return this.getTypedRuleContext(ExpressionContext, 0) as ExpressionContext;
    }
    public EOF(): TerminalNode {
        return this.getToken(AntsQueryParser.EOF, 0);
    }
    public get ruleIndex(): number {
        return AntsQueryParser.RULE_query;
    }
}


export class ExpressionContext extends ParserRuleContext {
    constructor(parser?: AntsQueryParser, parent?: ParserRuleContext, invokingState?: number) {
        super(parent, invokingState);
        this.parser = parser;
    }
    public conjunction_list(): ConjunctionContext[] {
        return this.getTypedRuleContexts(ConjunctionContext) as ConjunctionContext[];
    }
    public conjunction(i: number): ConjunctionContext {
        return this.getTypedRuleContext(ConjunctionContext, i) as ConjunctionContext;
    }
    public OR_list(): TerminalNode[] {
            return this.getTokens(AntsQueryParser.OR);
    }
    public OR(i: number): TerminalNode {
        return this.getToken(AntsQueryParser.OR, i);
    }
    public get ruleIndex(): number {
        return AntsQueryParser.RULE_expression;
    }
}


export class ConjunctionContext extends ParserRuleContext {
    constructor(parser?: AntsQueryParser, parent?: ParserRuleContext, invokingState?: number) {
        super(parent, invokingState);
        this.parser = parser;
    }
    public primary_list(): PrimaryContext[] {
        return this.getTypedRuleContexts(PrimaryContext) as PrimaryContext[];
    }
    public primary(i: number): PrimaryContext {
        return this.getTypedRuleContext(PrimaryContext, i) as PrimaryContext;
    }
    public AND_list(): TerminalNode[] {
            return this.getTokens(AntsQueryParser.AND);
    }
    public AND(i: number): TerminalNode {
        return this.getToken(AntsQueryParser.AND, i);
    }
    public get ruleIndex(): number {
        return AntsQueryParser.RULE_conjunction;
    }
}


export class PrimaryContext extends ParserRuleContext {
    constructor(parser?: AntsQueryParser, parent?: ParserRuleContext, invokingState?: number) {
        super(parent, invokingState);
        this.parser = parser;
    }
    public get ruleIndex(): number {
        return AntsQueryParser.RULE_primary;
    }
    public override copyFrom(ctx: PrimaryContext): void {
        super.copyFrom(ctx);
    }
}
export class ScopedFieldContext extends PrimaryContext {
    constructor(parser: AntsQueryParser, ctx: PrimaryContext) {
        super(parser, ctx.parentCtx, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public WORD(): TerminalNode {
        return this.getToken(AntsQueryParser.WORD, 0);
    }
    public COLON(): TerminalNode {
        return this.getToken(AntsQueryParser.COLON, 0);
    }
    public LPAREN(): TerminalNode {
        return this.getToken(AntsQueryParser.LPAREN, 0);
    }
    public expression(): ExpressionContext {
        return this.getTypedRuleContext(ExpressionContext, 0) as ExpressionContext;
    }
    public RPAREN(): TerminalNode {
        return this.getToken(AntsQueryParser.RPAREN, 0);
    }
}
export class FieldContext extends PrimaryContext {
    constructor(parser: AntsQueryParser, ctx: PrimaryContext) {
        super(parser, ctx.parentCtx, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public WORD(): TerminalNode {
        return this.getToken(AntsQueryParser.WORD, 0);
    }
    public COLON(): TerminalNode {
        return this.getToken(AntsQueryParser.COLON, 0);
    }
    public value(): ValueContext {
        return this.getTypedRuleContext(ValueContext, 0) as ValueContext;
    }
}
export class PhraseContext extends PrimaryContext {
    constructor(parser: AntsQueryParser, ctx: PrimaryContext) {
        super(parser, ctx.parentCtx, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public STRING(): TerminalNode {
        return this.getToken(AntsQueryParser.STRING, 0);
    }
}
export class TermContext extends PrimaryContext {
    constructor(parser: AntsQueryParser, ctx: PrimaryContext) {
        super(parser, ctx.parentCtx, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public WORD(): TerminalNode {
        return this.getToken(AntsQueryParser.WORD, 0);
    }
}
export class GroupContext extends PrimaryContext {
    constructor(parser: AntsQueryParser, ctx: PrimaryContext) {
        super(parser, ctx.parentCtx, ctx.invokingState);
        super.copyFrom(ctx);
    }
    public LPAREN(): TerminalNode {
        return this.getToken(AntsQueryParser.LPAREN, 0);
    }
    public expression(): ExpressionContext {
        return this.getTypedRuleContext(ExpressionContext, 0) as ExpressionContext;
    }
    public RPAREN(): TerminalNode {
        return this.getToken(AntsQueryParser.RPAREN, 0);
    }
}


export class ValueContext extends ParserRuleContext {
    constructor(parser?: AntsQueryParser, parent?: ParserRuleContext, invokingState?: number) {
        super(parent, invokingState);
        this.parser = parser;
    }
    public STRING(): TerminalNode {
        return this.getToken(AntsQueryParser.STRING, 0);
    }
    public WORD_list(): TerminalNode[] {
            return this.getTokens(AntsQueryParser.WORD);
    }
    public WORD(i: number): TerminalNode {
        return this.getToken(AntsQueryParser.WORD, i);
    }
    public COLON_list(): TerminalNode[] {
            return this.getTokens(AntsQueryParser.COLON);
    }
    public COLON(i: number): TerminalNode {
        return this.getToken(AntsQueryParser.COLON, i);
    }
    public get ruleIndex(): number {
        return AntsQueryParser.RULE_value;
    }
}
