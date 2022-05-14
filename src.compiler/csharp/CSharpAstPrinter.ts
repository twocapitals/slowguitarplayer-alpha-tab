import * as cs from './CSharpAst';
import * as ts from 'typescript';
import CSharpEmitterContext from './CSharpEmitterContext';
import AstPrinterBase from '../AstPrinterBase';

export default class CSharpAstPrinter extends AstPrinterBase {
    public constructor(sourceFile: cs.SourceFile, context: CSharpEmitterContext) {
        super(sourceFile, context);
    }

    protected writeSourceFile(sourceFile: cs.SourceFile) {
        this.writeLine('// <auto-generated>');
        this.writeLine('// This code was auto-generated.');
        this.writeLine('// Changes to this file may cause incorrect behavior and will be lost if');
        this.writeLine('// the code is regenerated.');
        this.writeLine('// </auto-generated>');
        this.writeLine('#nullable enable annotations');
        this.writeLine();
        for (const using of sourceFile.usings) {
            this.writeUsing(using);
        }
        if (sourceFile.usings.length > 0) {
            this.writeLine();
        }
        this.writeNamespace(sourceFile.namespace);
    }

    protected writeNamespace(namespace: cs.NamespaceDeclaration) {
        this.writeLine(`namespace ${namespace.namespace}`);
        this.beginBlock();
        this.writeNamespaceMembers(namespace.declarations);
        this.endBlock();
    }

    protected writeDocumentation(d: cs.DocumentedElement) {
        if (d.documentation) {
            this.writeLine('/// <summary>');
            this.writeDocumentationLines(d.documentation, true);
            this.writeLine('/// </summary>');
        }
    }

    protected writeDocumentationLines(documentation: string, multiLine: boolean) {
        const lines = documentation.split('\n');
        if (lines.length > 1 || multiLine) {
            if (!this._isStartOfLine) {
                this.writeLine();
            }
            for (const line of lines) {
                this.writeLine(`/// ${this.escapeXmlDoc(line)}`);
            }
        } else if (lines.length === 1) {
            if (this._isStartOfLine) {
                this.writeLine(`/// ${this.escapeXmlDoc(lines[0])}`);
            } else {
                this.write(this.escapeXmlDoc(lines[0]));
            }
        }
    }
    protected escapeXmlDoc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    protected writeParameter(p: cs.ParameterDeclaration) {
        if (p.params) {
            this.write('params ');
        }
        if (p.type) {
            this.writeType(p.type, false, p.params);
        }
        this.write(` ${p.name}`);

        if (p.initializer) {
            this.write(' = ');
            this.writeExpression(p.initializer);
        } else if (p.type && p.type.isOptional) {
            this.write(' = default');
        }
    }

    protected writeInterfaceDeclaration(d: cs.InterfaceDeclaration) {
        this.writeDocumentation(d);
        this.writeVisibility(d.visibility);

        if (d.partial) {
            this.write('partial ');
        }

        this.write(`interface ${d.name}`);
        this.writeTypeParameters(d.typeParameters);

        if (d.interfaces && d.interfaces.length > 0) {
            this.write(': ');
            this.writeCommaSeparated(d.interfaces, i => this.writeType(i));
        }

        this.writeTypeParameterConstraints(d.typeParameters);
        this.writeLine();
        this.beginBlock();

        d.members.forEach(m => this.writeMember(m));

        this.endBlock();
    }

    protected writeEnumDeclaration(d: cs.EnumDeclaration) {
        this.writeDocumentation(d);
        this.writeVisibility(d.visibility);
        this.write(`enum ${d.name}`);
        this.writeLine();
        this.beginBlock();

        d.members.forEach(m => this.writeEnumMember(m));

        this.endBlock();
    }

    protected writeEnumMember(m: cs.EnumMember): void {
        this.writeDocumentation(m);
        this.write(m.name);
        if (m.initializer) {
            this.write(' = ');
            this.writeExpression(m.initializer);
        }
        this.writeLine(',');
    }

    protected writeClassDeclaration(d: cs.ClassDeclaration) {
        this.writeDocumentation(d);
        this.writeAttributes(d);
        this.writeVisibility(d.visibility);

        if (d.partial) {
            this.write('partial ');
        }

        if (d.isAbstract) {
            this.write('abstract ');
        }

        this.write(`class ${d.name}`);
        this.writeTypeParameters(d.typeParameters);

        if (d.baseClass) {
            this.write(': ');
            this.writeType(d.baseClass);
        }

        if (d.interfaces && d.interfaces.length > 0) {
            if (d.baseClass) {
                this.write(', ');
            } else {
                this.write(': ');
            }

            this.writeCommaSeparated(d.interfaces, i => this.writeType(i));
        }
        this.writeTypeParameterConstraints(d.typeParameters);

        this.writeLine();

        this.beginBlock();

        let hasConstuctor = false;
        d.members.forEach(m => {
            this.writeMember(m);
            if (cs.isConstructorDeclaration(m) && !m.isStatic) {
                hasConstuctor = true;
            }
        });

        if (d.baseClass && !hasConstuctor) {
            let baseClass: cs.TypeReferenceType | undefined = d;
            let constructorDeclaration: cs.ConstructorDeclaration | undefined = undefined;
            while (baseClass && !constructorDeclaration) {
                if (typeof baseClass === 'string') {
                    constructorDeclaration = undefined;
                    break;
                } else if (cs.isClassDeclaration(baseClass)) {
                    constructorDeclaration = baseClass.members.find(m =>
                        cs.isConstructorDeclaration(m)
                    ) as cs.ConstructorDeclaration;
                    if (constructorDeclaration) {
                        break;
                    }

                    baseClass =
                        baseClass.baseClass && cs.isTypeReference(baseClass.baseClass)
                            ? baseClass.baseClass.reference
                            : undefined;
                } else {
                    constructorDeclaration = undefined;
                    break;
                }
            }

            if (constructorDeclaration) {
                const defaultConstructor = {
                    parent: d,
                    name: '',
                    nodeType: cs.SyntaxKind.ConstructorDeclaration,
                    isStatic: false,
                    parameters: [],
                    visibility: cs.Visibility.Public,
                    body: {
                        parent: null,
                        nodeType: cs.SyntaxKind.Block,
                        statements: [],
                        tsNode: d.tsNode
                    } as cs.Block,
                    tsNode: d.tsNode,
                    baseConstructorArguments: []
                } as cs.ConstructorDeclaration;
                defaultConstructor.body!.parent = defaultConstructor;
                defaultConstructor.parameters = constructorDeclaration.parameters;
                defaultConstructor.baseConstructorArguments = constructorDeclaration.parameters.map(
                    p =>
                        ({
                            parent: defaultConstructor,
                            nodeType: cs.SyntaxKind.Identifier,
                            text: p.name,
                            tsNode: defaultConstructor.tsNode
                        } as cs.Identifier)
                );
                this.writeMember(defaultConstructor);
            }
        }

        this.endBlock();
    }

    protected writeAttribute(a: cs.Attribute): void {
        this.write('[');
        this.writeType(a.type);
        if (a.arguments && a.arguments.length > 0) {
            this.write('(');
            this.writeCommaSeparated(a.arguments!, x => this.writeExpression(x));
            this.write(')');
        }
        this.writeLine(']');
    }

    protected writeMethodDeclaration(d: cs.MethodDeclaration) {
        this.writeDocumentation(d);
        this.writeParameterDocumentation(d);

        this.writeAttributes(d);
        this.writeVisibility(d.visibility);

        if (d.isStatic) {
            this.write('static ');
        }

        if (d.isAsync) {
            this.write('async ');
        }

        if (d.isAbstract) {
            this.write('abstract ');
        }
        else if (d.isVirtual) {
            this.write('virtual ');
        }
        else if (d.isOverride) {
            this.write('override ');
        }

        if (d.isAsync) {
            if (cs.isPrimitiveTypeNode(d.returnType) && d.returnType.type === cs.PrimitiveType.Void) {
                this.write('System.Threading.Tasks.Task');
            } else {
                this.write('System.Threading.Tasks.Task<');
                this.writeType(d.returnType);
                this.write('>');
            }
        } else {
            this.writeType(d.returnType);
        }

        this.write(` ${d.name}`);
        this.writeTypeParameters(d.typeParameters);
        this.writeParameters(d.parameters);
        this.writeTypeParameterConstraints(d.typeParameters);

        this.writeBody(d.body);
    }

    protected writeParameterDocumentation(d: cs.MethodDeclaration) {
        for (const p of d.parameters) {
            if (p.documentation) {
                this.write(`/// <param name="${p.name}">`);
                this.writeDocumentationLines(p.documentation, false);
                if (this._isStartOfLine) {
                    this.write('/// ');
                }
                this.writeLine('</param>');
            }
        }
    }

    protected writeBody(body: cs.Expression | cs.Block | undefined) {
        if (body) {
            if (cs.isBlock(body)) {
                this.writeLine();
                this.writeBlock(body);
            } else {
                this.write(' => ');
                this.writeExpression(body as cs.Expression);
            }
        } else {
            this.writeLine(';');
        }
    }

    protected writeConstructorDeclaration(d: cs.ConstructorDeclaration) {
        this.writeDocumentation(d);
        this.writeVisibility(d.visibility);
        if (d.isStatic) {
            this.write('static ');
        }
        this.write(`${(d.parent as cs.ClassDeclaration).name}`);
        this.writeParameters(d.parameters);

        if (d.baseConstructorArguments) {
            this.writeLine();
            this._indent++;
            this.write(': base (');
            this.writeCommaSeparated(d.baseConstructorArguments, e => this.writeExpression(e));
            this.write(')');
            this._indent--;
        }

        this.writeBody(d.body);
    }

    protected writePropertyDeclaration(d: cs.PropertyDeclaration) {
        this.writeDocumentation(d);
        this.writeVisibility(d.visibility);

        const writeAsField = this.writePropertyAsField(d);

        if (writeAsField && this.canBeConstant(d)) {
            this.write('const ');
        } else {
            if (d.isStatic) {
                this.write('static ');
            }

            if (d.isAbstract) {
                this.write('abstract ');
            }
            else if (d.isVirtual) {
                this.write('virtual ');
            }
            else if (d.isOverride) {
                this.write('override ');
            }
        }

        this.writeType(d.type);
        this.write(` ${d.name}`);

        if (!writeAsField) {
            this.writeLine();
            this.beginBlock();

            if (d.getAccessor) {
                this.writePropertyAccessor(d.getAccessor);
            }

            if (d.setAccessor) {
                this.writePropertyAccessor(d.setAccessor);
            }

            this.endBlock();
        }

        if (d.initializer) {
            this.write(' = ');
            this.writeExpression(d.initializer);
            this.writeLine(';');
        } else if (writeAsField) {
            this.writeLine(';');
        }
    }

    protected writePropertyAccessor(accessor: cs.PropertyAccessorDeclaration) {
        this.write(accessor.keyword);
        this.writeBody(accessor.body);
    }

    protected writeFieldDeclarat1on(d: cs.FieldDeclaration) {
        this.writeDocumentation(d);
        this.writeVisibility(d.visibility);

        if (this._context.isConst(d)) {
            this.write('const ');
        } else {
            if (d.isStatic) {
                this.write('static ');
            }

            if (d.isReadonly) {
                this.write('readonly ');
            }
        }

        this.writeType(d.type);
        this.write(` ${d.name}`);
        if (d.initializer) {
            this.write(' = ');
            this.writeExpression(d.initializer);
        }
        this.writeLine(';');
    }

    protected writeType(
        type: cs.TypeNode,
        forNew: boolean = false,
        asNativeArray: boolean = false,
        forTypeConstraint: boolean = false
    ) {
        switch (type.nodeType) {
            case cs.SyntaxKind.PrimitiveTypeNode:
                if (forTypeConstraint) {
                    switch ((type as cs.PrimitiveTypeNode).type) {
                        case cs.PrimitiveType.Bool:
                        case cs.PrimitiveType.Int:
                        case cs.PrimitiveType.Double:
                            this.write('struct');
                            break;
                        case cs.PrimitiveType.Object:
                        case cs.PrimitiveType.Dynamic:
                        case cs.PrimitiveType.String:
                        case cs.PrimitiveType.Void:
                            this.write('class');
                            break;
                    }
                } else {
                    switch ((type as cs.PrimitiveTypeNode).type) {
                        case cs.PrimitiveType.Bool:
                            this.write('bool');
                            break;
                        case cs.PrimitiveType.Dynamic:
                            this.write('dynamic');
                            break;
                        case cs.PrimitiveType.Double:
                            this.write('double');
                            break;
                        case cs.PrimitiveType.Int:
                            this.write('int');
                            break;
                        case cs.PrimitiveType.Object:
                            this.write('object');
                            break;
                        case cs.PrimitiveType.String:
                            this.write('string');
                            break;
                        case cs.PrimitiveType.Void:
                            this.write('void');
                            break;
                        case cs.PrimitiveType.Var:
                            this.write('var');
                            break;
                    }
                }

                break;
            case cs.SyntaxKind.ArrayTypeNode:
                const arrayType = type as cs.ArrayTypeNode;
                if (asNativeArray) {
                    this.writeType(arrayType.elementType);
                    this.write('[]');
                } else {
                    const isDynamicArray =
                        cs.isPrimitiveTypeNode(arrayType.elementType) &&
                        arrayType.elementType.type === cs.PrimitiveType.Dynamic;
                    if (isDynamicArray && !forNew) {
                        this.write('System.Collections.IList');
                    } else {
                        if (forNew) {
                            this.write('AlphaTab.Collections.List<');
                        } else {
                            this.write('System.Collections.Generic.IList<');
                        }
                        this.writeType(arrayType.elementType);
                        this.write('>');
                    }
                }

                break;
            case cs.SyntaxKind.MapTypeNode:
                const mapType = type as cs.MapTypeNode;
                if (!mapType.valueIsValueType) {
                    if (forNew) {
                        this.write('AlphaTab.Collections.Map<');
                    } else {
                        this.write('AlphaTab.Collections.IMap<');
                    }
                } else {
                    if (forNew) {
                        this.write('AlphaTab.Collections.ValueTypeMap<');
                    } else {
                        this.write('AlphaTab.Collections.IValueTypeMap<');
                    }
                }
                this.writeType(mapType.keyType);
                this.write(', ');
                this.writeType(mapType.valueType);
                this.write('>');
                break;
            case cs.SyntaxKind.FunctionTypeNode:
                const functionType = type as cs.FunctionTypeNode;
                if (
                    cs.isPrimitiveTypeNode(functionType.returnType) &&
                    functionType.returnType.type === cs.PrimitiveType.Void
                ) {
                    this.write('System.Action');
                    if (functionType.parameterTypes.length > 0) {
                        this.write('<');
                        this.writeCommaSeparated(functionType.parameterTypes, p => this.writeType(p));
                        this.write('>');
                    }
                } else {
                    this.write('System.Func');
                    this.write('<');
                    if (functionType.parameterTypes.length > 0) {
                        this.writeCommaSeparated(functionType.parameterTypes, p => this.writeType(p));
                        this.write(', ');
                        this.writeType(functionType.returnType);
                    } else {
                        this.writeType(functionType.returnType);
                    }
                    this.write('>');
                }
                break;
            case cs.SyntaxKind.TypeReference:
                const typeReference = type as cs.TypeReference;
                const targetType = (type as cs.TypeReference).reference;
                if (typeof targetType === 'string') {
                    this.write(targetType);
                } else {
                    this.writeType(targetType, forNew);
                }

                if (typeReference.typeArguments && typeReference.typeArguments.length > 0) {
                    this.write('<');
                    this.writeCommaSeparated(typeReference.typeArguments, p => this.writeType(p));
                    this.write('>');
                }
                break;
            case cs.SyntaxKind.ClassDeclaration:
            case cs.SyntaxKind.InterfaceDeclaration:
            case cs.SyntaxKind.EnumDeclaration:
                this.write(this._context.getFullName(type as cs.NamedTypeDeclaration));
                break;
            case cs.SyntaxKind.TypeParameterDeclaration:
                this.write((type as cs.TypeParameterDeclaration).name);
                break;
            case cs.SyntaxKind.EnumMember:
                this.write(this._context.getFullName((type as cs.EnumMember).parent as cs.NamedTypeDeclaration));
                break;
            default:
                this.write('TODO: ' + cs.SyntaxKind[type.nodeType]);
                break;
        }
        if (type.isNullable && !forNew && !forTypeConstraint) {
            this.write('?');
        }
    }

    protected writeTypeOfExpression(expr: cs.TypeOfExpression) {
        this.write('typeof');
        if (expr.expression) {
            this.write('(');
            this.writeExpression(expr.expression);
            this.write(')');
        }
    }

    protected writePrefixUnaryExpression(expr: cs.PrefixUnaryExpression) {
        this.write(expr.operator);
        this.writeExpression(expr.operand);
    }

    protected writeBaseLiteralExpression(expr: cs.BaseLiteralExpression) {
        this.write('base');
    }

    protected writeAwaitExpression(expr: cs.AwaitExpression) {
        this.write('await ');
        this.writeExpression(expr.expression);
    }

    protected writeBinaryExpression(expr: cs.BinaryExpression) {
        this.writeExpression(expr.left);
        this.write(' ');
        this.write(expr.operator);
        this.write(' ');
        this.writeExpression(expr.right);
    }

    protected writeConditionalExpression(expr: cs.ConditionalExpression) {
        this.writeExpression(expr.condition);
        this.write(' ? ');
        this.writeExpression(expr.whenTrue);
        this.write(' : ');
        this.writeExpression(expr.whenFalse);
    }

    protected writeLambdaExpression(expr: cs.LambdaExpression) {
        this.write('(');
        this.writeCommaSeparated(expr.parameters, p => this.writeParameter(p));
        this.write(') => ');
        if (cs.isBlock(expr.body)) {
            this.writeBlock(expr.body);
        } else {
            this.writeExpression(expr.body);
        }
    }

    protected writeNumericLiteral(expr: cs.NumericLiteral) {
        this.write(expr.value);
    }

    protected writeStringTemplateExpression(expr: cs.StringTemplateExpression) {
        this.write('string.Format(System.Globalization.CultureInfo.InvariantCulture, @"');
        let exprs: cs.Expression[] = [];
        expr.chunks.forEach(c => {
            if (cs.isStringLiteral(c)) {
                const escapedText = c.text.split('"').join('""');
                this.write(escapedText);
            } else {
                this.write(`{${exprs.length}}`);
                exprs.push(c as cs.Expression);
            }
        });
        this.write('"');
        exprs.forEach(expr => {
            this.write(', ');
            this.writeExpression(expr);
        });
        this.write(')');
    }

    protected writeArrayCreationExpression(expr: cs.ArrayCreationExpression) {
        if (expr.type) {
            this.write('new ');
            this.writeType(expr.type, true);
            if (expr.values) {
                if (expr.values.length > 0) {
                    this.writeLine('{');
                    this._indent++;
                    this.writeCommaSeparated(expr.values, v => {
                        if (expr.values!.length > 10) {
                            this.writeLine();
                        }
                        this.writeExpression(v);
                    });
                    this._indent--;
                    this.writeLine('}');
                } else {
                    this.writeLine('()');
                }
            } else {
                this.write('[');
                this.writeExpression(expr.sizeExpression!);
                this.write(']');
            }
        } else if (expr.values && expr.values.length > 0) {
            this.write('AlphaTab.Core.TypeHelper.CreateList(');
            this.writeCommaSeparated(expr.values, v => {
                if (expr.values!.length > 10) {
                    this.writeLine();
                }
                this.writeExpression(v);
            });
            this.write(')');
        } else {
            this._context.addCsNodeDiagnostics(expr, 'Unknown array type', ts.DiagnosticCategory.Error);
        }
    }

    protected writeMemberAccessExpression(expr: cs.MemberAccessExpression) {
        this.writeExpression(expr.expression);
        this.write(expr.nullSafe ? '?.' : '.');
        const name = this._context.getSymbolName(expr) ?? expr.member;
        this.write(name);
    }

    protected writeElementAccessExpression(expr: cs.ElementAccessExpression) {
        this.writeExpression(expr.expression);
        if (expr.nullSafe) {
            this.write('?');
        }
        this.write('[');
        this.writeExpression(expr.argumentExpression);
        this.write(']');
    }

    protected writeNewExpression(expr: cs.NewExpression) {
        this.write('new ');
        this.writeType(expr.type, true);
        this.write('(');
        this.writeCommaSeparated(expr.arguments, a => this.writeExpression(a));
        this.write(')');
    }

    protected writeCastExpression(expr: cs.CastExpression) {
        this.write('(');
        this.writeType(expr.type);
        this.write(')');
        this.writeExpression(expr.expression);
    }

    protected writeNonNullExpression(expr: cs.NonNullExpression) {
        this.writeExpression(expr.expression);
        if (!cs.isNonNullExpression(expr)) {
            this.write('!');
        }
    }

    protected writeCatchClause(c: cs.CatchClause): void {
        this.write('catch (');
        this.writeType(c.variableDeclaration.type);
        this.write(' ');
        this.write(c.variableDeclaration.name);
        this.writeLine(')');
        this.writeBlock(c.block);
    }

    protected writeSwitchStatement(s: cs.SwitchStatement) {
        this.write('switch (');
        this.writeExpression(s.expression);
        this.writeLine(')');
        this.beginBlock();

        s.caseClauses.forEach(c => {
            if (cs.isDefaultClause(c)) {
                this.writeDefaultClause(c);
            } else if (cs.isCaseClause(c)) {
                this.writeCaseClause(c);
            }
        });

        this.endBlock();
    }

    protected writeCaseClause(c: cs.CaseClause) {
        this.write('case ');
        this.writeExpression(c.expression);
        this.writeLine(':');
        this._indent++;
        c.statements.forEach(s => this.writeStatement(s));
        this._indent--;
    }

    protected writeDefaultClause(c: cs.DefaultClause) {
        this.writeLine('default:');
        this._indent++;
        c.statements.forEach(s => this.writeStatement(s));
        this._indent--;
    }

    protected writeForEachStatement(s: cs.ForEachStatement) {
        this.write('foreach (');
        if (cs.isVariableDeclarationList(s.initializer)) {
            this.writeVariableDeclarationList(s.initializer);
        } else {
            this.writeExpression(s.initializer as cs.Expression);
        }
        this.write(' in ');
        this.writeExpression(s.expression);
        this.writeLine(')');

        if (cs.isBlock(s.statement)) {
            this.writeStatement(s.statement);
        } else {
            this._indent++;
            this.writeStatement(s.statement);
            this._indent--;
        }
    }

    protected writeForStatement(s: cs.ForStatement) {
        this.write('for (');
        if (s.initializer) {
            if (cs.isVariableDeclarationList(s.initializer)) {
                this.writeVariableDeclarationList(s.initializer);
            } else {
                this.writeExpression(s.initializer as cs.Expression);
            }
        }
        this.write(';');

        if (s.condition) {
            this.writeExpression(s.condition);
        }
        this.write(';');

        if (s.incrementor) {
            this.writeExpression(s.incrementor);
        }
        this.writeLine(')');

        if (cs.isBlock(s.statement)) {
            this.writeStatement(s.statement);
        } else {
            this._indent++;
            this.writeStatement(s.statement);
            this._indent--;
        }
    }

    protected writeVariableDeclarationList(declarationList: cs.VariableDeclarationList) {
        this.writeType(declarationList.declarations[0].type);

        declarationList.declarations.forEach((d, i) => {
            if (i === 0) {
                this.write(' ');
            } else {
                this.write(', ');
            }

            if (d.deconstructNames) {
                this.write('(');
                d.deconstructNames.forEach((v, i) => {
                    if (i > 0) {
                        this.write(', ');
                    }
                    this.write(v);
                });
                this.write(')');
            } else {
                this.write(d.name);
            }

            if (d.initializer) {
                this.write(' = ');
                this.writeExpression(d.initializer);
            }
        });
    }

    protected writeBlock(b: cs.Block) {
        this.beginBlock();
        b.statements.forEach(s => this.writeStatement(s));
        this.endBlock();
    }

    protected writeUsing(using: cs.UsingDeclaration) {
        this.writeLine(`using ${using.namespaceOrTypeName};`);
    }
}
