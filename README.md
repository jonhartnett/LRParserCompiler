#LR1 Parser Compiler

This program compiles [lr-parsers](https://en.wikipedia.org/wiki/LR_parser) based on quasi-form descriptions of language grammars.
Quasi-Form is a modification/extension of [Extended Backus-Naur Form (EBNF)](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_form).
The compiler can not only be run and executed on-the-fly but also emit compiled meta-data for any given parser allowing it to be efficiently resurrected for reuse. 
The resulting parsers are lr(1) but use a unique branching method to attain lr(∞) recognition power<sup>1</sup>. See the src/main.js file for usage.

<sup>1</sup>: Performance of lr(k) parsing falls off exponentially with increasing k. This is typically not a problem as most languages are intentionally designed for low-k parsers.
The performance of the parser varies dynamically with the k value, so languages such as C which typically have a k-value of 1 but may require arbitrarily-large k for certain sections of code do not see a performance hit except in those sections that require the large k-value.