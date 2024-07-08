# Typer Checker

A robust TypeScript class for type checking and validation.

## Overview

The `Typer` class provides a comprehensive type checking and validation utility for TypeScript projects. It includes methods for verifying the types of various data structures, ensuring that values meet specified criteria, and validating inputs in a consistent manner.

## Installation

Install the package via NPM:

```bash
npm i data-type-validator


Methods
isArrayOf(elementType: string, p: any): any[] | void
Checks if the provided parameter is an array of a specified type.

isEmail(p: any): string | void
Checks if the provided parameter is a valid email address.

isInRange(min: number, max: number, p: any): number | void
Checks if the provided parameter is a number within a specified range.

isInteger(p: any): number | void
Checks if the provided parameter is an integer.

isNonEmptyArray(p: any): any[] | void
Checks if the provided parameter is a non-empty array.

isNonEmptyString(p: any): string | void
Checks if the provided parameter is a non-empty string.

isOneOf(values: any[], p: any): any[]
Checks if the provided parameter is one of the specified values.

isPhoneNumber(p: any): string | void
Checks if the provided parameter is a valid phone number.

isPositiveNumber(p: any): number | void
Checks if the provided parameter is a positive number.

isPositiveInteger(p: any): number | void
Checks if the provided parameter is a positive integer.

isNegativeNumber(p: any): number | void
Checks if the provided parameter is a negative number.

isNegativeInteger(p: any): number | void
Checks if the provided parameter is a negative integer.

isURL(p: any): string | void
Checks if the provided parameter is a valid URL.

isType(types: any[] | string, p: any): any | void
Checks if the parameter matches one of the specified types.

expect(funct: Function, types: { paramTypes: string | string[], returnType: string | string[] }): Function
Expects a function to conform to specified input and output types.
