import React from 'react';
import {state} from 'lstream';
import {IconType} from "react-icons";
import {ActionAppearance} from "../actions/actionSystemPlugin";
import {ApplicationContext, CoreContext} from "context";
import {OperationResult} from "./craftPlugin";
import {OperationSchema, SchemaField, schemaIterator, unwrapMetadata} from "cad/craft/schema/schema";
import {FormDefinition} from "cad/mdf/ui/uiDefinition";
import {Types} from "cad/craft/schema/types";
import {EntityTypeSchema} from "cad/craft/schema/types/entityType";
import {FlattenPath, ParamsPath} from "cad/craft/wizard/wizardTypes";
import {IconDeclaration} from "cad/icons/IconDeclaration";
import {resolveIcon} from "cad/craft/ui/iconResolver";
import {loadDeclarativeForm} from "cad/mdf/declarativeFormLoader";
import {operationIconToActionIcon} from "cad/craft/operationHelper";

export function activate(ctx: ApplicationContext) {

  const registry$ = state({});

  ctx.streams.operation = {
    registry:registry$
  };
  
  function addOperation(descriptor: OperationDescriptor<any>, actions) {
    let {id, label, info, icon, actionParams, form, schema} = descriptor;

    if (!schema) {
      let {schema: derivedSchema, form: loadedForm} = loadDeclarativeForm(form as FormDefinition);
      schema = derivedSchema;
      form = loadedForm;
    }

    if (!label) {
      label = id;
    }

    let appearance: ActionAppearance = {
      label,
      info
    };

    operationIconToActionIcon(icon, appearance);

    let opAction = {
      id: id,
      appearance,
      invoke: () => ctx.services.wizard.open(id),
      ...actionParams
    };

    let schemaIndex = createSchemaIndex(schema);

    let operation = {
      appearance,
      schemaIndex,
      ...descriptor,
      schema, form
    };

    registry$.mutate(registry => registry[id] = operation);
    actions.push(opAction);

    if (descriptor.masking) {
      descriptor.masking.forEach(masking => {


        const appearance = {
          ...opAction.appearance,
          label: masking.label,
          info: masking.info,
        };

        operationIconToActionIcon(masking.icon, appearance);

        actions.push({
          ...opAction,
          id: masking.id,
          appearance,
          invoke: () => ctx.services.wizard.open(id, masking.maskingParams),
        });

      });
    }
  }

  function registerOperations(operations) {
    let actions = [];
    for (let op of operations) {
      addOperation(op, actions);
    }
    ctx.actionService.registerActions(actions);
  }

  function get<T>(id: string): Operation<T> {
    let op = registry$.value[id];
    if (!op) {
      throw `operation ${id} is not registered`;
    }
    return op;
  }

  ctx.operationService = {
    registerOperations,
    get
  };

  ctx.services.operation = ctx.operationService;
}

export interface Operation<R> extends OperationDescriptor<R>{
  appearance: {
    id: string;
    label: string;
    info: string;
    icon32: string;
    icon96: string;
    icon: string|IconType;
  };
  schemaIndex: SchemaIndex;
  form: React.FunctionComponent;
  schema: OperationSchema;
}

type OpIcon = IconDeclaration | IconType | string | ((props: any) => JSX.Element);

export interface OperationDescriptor<R> {
  id: string;
  label: string;
  info: string;
  icon: OpIcon;
  actionParams?: any;
  run: (params: {}, ctx: CoreContext, rawParams: R) => OperationResult | Promise<OperationResult>;
  paramsInfo: (params: R) => string,
  previewGeomProvider?: (params: R) => OperationGeometryProvider,
  previewer?: any,
  form: FormDefinition | React.FunctionComponent,
  defaultActiveField: string,
  schema?: OperationSchema,
  onParamsUpdate?: (params, name, value) => void,
  masking?: {
    id: string,
    label: string;
    info: string,
    icon: OpIcon;
    maskingParams: any;
  }[],
  dynamicLabel?: (params: R) => string,
  dynamicIcon?: (params: R) => OpIcon,
}

export interface OperationService {
  registerOperations(descriptior: OperationDescriptor<any>[]);
  get<T>(operationId: string): Operation<T>;
}

export type Index<T> = {
  [beanPath: string]: T
};


export interface SchemaIndexField {
  path: ParamsPath,
  flattenedPath: FlattenPath,
  metadata: SchemaField
}

export interface EntityReference {
  field: SchemaIndexField;
  metadata: EntityTypeSchema;
  isArray: boolean;
}

export interface SchemaIndex {
  fields: SchemaIndexField[],
  entities: EntityReference[],
  fieldsByFlattenedPaths: Index<SchemaIndexField>;
  entitiesByFlattenedPaths: Index<EntityReference>;
}

export interface OperationGeometryProvider {

}

function createSchemaIndex(schema: OperationSchema): SchemaIndex {

  const index = {
    fields: [],
    fieldsByFlattenedPaths: {},
    entities: [],
    entitiesByFlattenedPaths: {}
  } as SchemaIndex;

  schemaIterator(schema, (path, flattenedPath, metadata) => {
    const indexField = {
      path: [...path],
      flattenedPath,
      metadata
    };
    index.fields.push(indexField);
    index.fieldsByFlattenedPaths[flattenedPath] = indexField;

  });

  index.fields.forEach(f => {

    const unwrappedMd = unwrapMetadata(f.metadata);

    if (unwrappedMd.type !== Types.entity) {
      return;
    }
    const entity: EntityReference= {
      field: f,
      isArray: f.metadata.type === Types.array,
      metadata: unwrappedMd
    };

    index.entities.push(entity);
    index.entitiesByFlattenedPaths[f.flattenedPath] = entity;
  });

  return index;
}

declare module 'context' {
  interface CoreContext {

    operationService: OperationService;
  }
}

