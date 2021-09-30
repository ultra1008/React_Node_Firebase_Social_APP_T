exports.schema = {
  type: "object",
  required: ["version", "metadata", "classMap", "events"],
  properties: {
    version: {
      enum: ["1.6.0", "1.6"],
    },
    metadata: {
      $ref: "#/definitions/metadata",
    },
    classMap: {
      type: "array",
      items: {
        $ref: "#/definitions/package",
      },
    },
    events: {
      type: "array",
      items: {
        anyOf: [
          {
            $ref: "#/definitions/function-call",
          },
          {
            $ref: "#/definitions/function-return",
          },
          {
            $ref: "#/definitions/http-client-request",
          },
          {
            $ref: "#/definitions/http-client-response",
          },
          {
            $ref: "#/definitions/http-server-request",
          },
          {
            $ref: "#/definitions/http-server-response",
          },
          {
            $ref: "#/definitions/sql-query",
          },
          {
            $ref: "#/definitions/sql-result",
          },
        ],
      },
    },
  },
  definitions: {
    metadata: {
      type: "object",
      required: ["client", "recorder"],
      properties: {
        name: {
          type: "string",
          nullable: true,
        },
        labels: {
          type: "array",
          nullable: true,
          items: {
            type: "string",
          },
        },
        app: {
          type: "string",
          nullable: true,
        },
        language: {
          type: "object",
          nullable: true,
          required: ["name", "version"],
          properties: {
            name: {
              type: "string",
            },
            engine: {
              type: "string",
              nullable: true,
            },
            version: {
              type: "string",
            },
          },
        },
        frameworks: {
          type: "array",
          nullable: true,
          items: {
            type: "object",
            required: ["name", "version"],
            properties: {
              name: {
                type: "string",
              },
              version: {
                type: "string",
              },
            },
          },
        },
        client: {
          type: "object",
          required: ["name", "url"],
          properties: {
            name: {
              type: "string",
            },
            url: {
              type: "string",
            },
            version: {
              type: "string",
            },
          },
        },
        recorder: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
            },
          },
        },
        recording: {
          type: "object",
          nullable: true,
          required: ["defined_class", "method_id"],
          properties: {
            defined_class: {
              type: "string",
            },
            method_id: {
              type: "string",
            },
          },
        },
        git: {
          type: "object",
          nullable: true,
          required: ["repository", "branch", "commit", "status"],
          properties: {
            repository: {
              type: "string",
            },
            branch: {
              type: "string",
            },
            commit: {
              type: "string",
            },
            status: {
              type: "array",
              items: {
                type: "string",
              },
            },
            tag: {
              type: "string",
              nullable: true,
            },
            annotated_tag: {
              type: "string",
              nullable: true,
            },
            commits_since_tag: {
              type: "integer",
              nullable: true,
              minimum: 0,
            },
            commits_since_annotated_tag: {
              type: "integer",
              nullable: true,
              minimum: 0,
            },
            test_status: {
              enum: [null, "succeeded", "failed"],
            },
            exception: {
              type: "object",
              nullable: true,
              required: ["class"],
              properties: {
                class: {
                  type: "string",
                },
                message: {
                  type: "string",
                  nullable: true,
                },
              },
            },
          },
        },
      },
    },
    package: {
      type: "object",
      required: ["type", "name"],
      properties: {
        type: {
          const: "package",
        },
        name: {
          type: "string",
        },
        children: {
          type: "array",
          nullable: true,
          items: {
            anyOf: [
              {
                $ref: "#/definitions/package",
              },
              {
                $ref: "#/definitions/class",
              },
            ],
          },
        },
      },
    },
    class: {
      type: "object",
      required: ["type", "name"],
      properties: {
        type: {
          const: "class",
        },
        name: {
          type: "string",
        },
        children: {
          type: "array",
          nullable: true,
          items: {
            anyOf: [
              {
                $ref: "#/definitions/class",
              },
              {
                $ref: "#/definitions/function",
              },
            ],
          },
        },
      },
    },
    function: {
      type: "object",
      required: ["type", "name", "static"],
      properties: {
        type: {
          const: "function",
        },
        name: {
          type: "string",
        },
        location: {
          type: "string",
          nullable: true,
        },
        static: {
          type: "boolean",
        },
        labels: {
          type: "array",
          nullable: true,
          items: {
            type: "string",
          },
        },
        comment: {
          type: "string",
          nullable: true,
        },
        source: {
          type: "string",
          nullable: true,
        },
      },
    },
    call: {
      type: "object",
      required: ["id", "event", "thread_id"],
      properties: {
        id: {
          type: "integer",
          minimum: 0,
        },
        event: {
          const: "call",
        },
        thread_id: {
          type: "integer",
          minimum: 0,
        },
        parent_id: false,
        elapsed: false,
      },
    },
    return: {
      type: "object",
      required: ["id", "event", "thread_id", "parent_id"],
      properties: {
        id: {
          type: "integer",
          minimum: 0,
        },
        event: {
          const: "return",
        },
        thread_id: {
          type: "integer",
          minimum: 0,
        },
        parent_id: {
          type: "integer",
          minimum: 0,
        },
        elapsed: {
          type: "number",
          minimum: 0,
        },
      },
    },
    headers: {
      nullable: true,
      type: "object",
      additionalProperties: {
        type: "string",
      },
    },
    verb: {
      enum: ["GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"],
    },
    parameter: {
      type: "object",
      required: ["class", "value"],
      properties: {
        name: {
          type: "string",
          nullable: true,
        },
        object_id: {
          type: "integer",
          nullable: true,
          minimum: 0,
        },
        class: {
          type: "string",
        },
        value: {
          type: "string",
          maxLength: 100,
        },
      },
    },
    exception: {
      type: "object",
      required: ["class", "message", "object_id"],
      properties: {
        class: {
          type: "string",
        },
        message: {
          type: "string",
        },
        object_id: {
          type: "integer",
          nullable: true,
          minimum: 0,
        },
        path: {
          type: "string",
          nullable: true,
        },
        lineno: {
          type: "integer",
          nullable: true,
          minimum: 0,
        },
      },
    },
    "function-call": {
      allOf: [
        {
          $ref: "#/definitions/call",
        },
        {
          type: "object",
          required: ["defined_class", "method_id", "static"],
          properties: {
            defined_class: {
              type: "string",
            },
            method_id: {
              type: "string",
            },
            path: {
              type: "string",
              nullable: true,
            },
            lineno: {
              type: "integer",
              minimum: 0,
              nullable: true,
            },
            receiver: {
              anyOf: [
                {
                  const: null,
                },
                {
                  $ref: "#/definitions/parameter",
                },
              ],
            },
            parameters: {
              type: "array",
              nullable: true,
              items: {
                $ref: "#/definitions/parameter",
              },
            },
            static: {
              type: "boolean",
            },
            sql_query: false,
            http_client_request: false,
            http_server_request: false,
          },
        },
      ],
    },
    "function-return": {
      allOf: [
        {
          $ref: "#/definitions/return",
        },
        {
          type: "object",
          properties: {
            return_value: {
              anyOf: [
                {
                  const: null,
                },
                {
                  $ref: "#/definitions/parameter",
                },
              ],
            },
            exceptions: {
              type: "array",
              nullable: true,
              items: {
                $ref: "#/definitions/exception",
              },
            },
            http_client_response: false,
            http_server_response: false,
          },
        },
      ],
    },
    "http-client-request": {
      allOf: [
        {
          $ref: "#/definitions/call",
        },
        {
          type: "object",
          required: ["http_client_request", "message"],
          properties: {
            http_client_request: {
              type: "object",
              required: ["request_method", "url"],
              properties: {
                request_method: {
                  $ref: "#/definitions/verb",
                },
                url: {
                  type: "string",
                },
                headers: {
                  $ref: "#/definitions/headers",
                },
              },
            },
            message: {
              type: "array",
              items: {
                $ref: "#/definitions/parameter",
              },
            },
            defined_class: false,
            method_id: false,
            sql_query: false,
            http_server_request: false,
          },
        },
      ],
    },
    "http-client-response": {
      allOf: [
        {
          $ref: "#/definitions/return",
        },
        {
          type: "object",
          required: ["http_client_response"],
          properties: {
            http_client_response: {
              type: "object",
              required: ["status_code"],
              properties: {
                headers: {
                  $ref: "#/definitions/headers",
                },
                status_code: {
                  type: "integer",
                  minimum: 100,
                  maximum: 599,
                },
                mime_type: {
                  type: "string",
                  nullable: true,
                },
              },
            },
            return_value: false,
            exceptions: false,
            http_server_response: false,
          },
        },
      ],
    },
    "http-server-request": {
      allOf: [
        {
          $ref: "#/definitions/call",
        },
        {
          type: "object",
          required: ["http_server_request", "message"],
          properties: {
            http_server_request: {
              type: "object",
              required: ["request_method", "path_info"],
              properties: {
                headers: {
                  $ref: "#/definitions/headers",
                },
                authorization: {
                  type: "string",
                  nullable: true,
                },
                mime_type: {
                  type: "string",
                  nullable: true,
                },
                request_method: {
                  $ref: "#/definitions/verb",
                },
                path_info: {
                  type: "string",
                },
                normalized_path_info: {
                  type: "string",
                  nullable: true,
                },
                protocol: {
                  enum: [null, "HTTP/1", "HTTP/1.0", "HTTP/1.1", "HTTP/2", "HTTP/2.0"],
                },
              },
            },
            message: {
              type: "array",
              items: {
                $ref: "#/definitions/parameter",
              },
            },
            defined_class: false,
            method_id: false,
            sql_query: false,
            http_client_request: false,
          },
        },
      ],
    },
    "http-server-response": {
      allOf: [
        {
          $ref: "#/definitions/return",
        },
        {
          type: "object",
          required: ["http_server_response"],
          properties: {
            http_server_response: {
              type: "object",
              required: ["status_code"],
              properties: {
                status_code: {
                  type: "integer",
                  minimum: 100,
                  maximum: 599,
                },
                mime_type: {
                  type: "string",
                  nullable: true,
                },
              },
            },
            return_value: false,
            exceptions: false,
            http_client_response: false,
          },
        },
      ],
    },
    "sql-query": {
      allOf: [
        {
          $ref: "#/definitions/call",
        },
        {
          type: "object",
          required: ["sql_query"],
          properties: {
            sql_query: {
              type: "object",
              required: ["database_type", "sql"],
              properties: {
                database_type: {
                  type: "string",
                },
                sql: {
                  type: "string",
                },
                explain_sql: {
                  type: "string",
                  nullable: true,
                },
                server_version: {
                  type: "string",
                  nullable: true,
                },
              },
            },
            defined_class: false,
            method_id: false,
            http_server_request: false,
            http_client_request: false,
          },
        },
      ],
    },
    "sql-result": {
      allOf: [
        {
          $ref: "#/definitions/return",
        },
        {
          type: "object",
          properties: {
            return_value: false,
            exceptions: false,
            http_client_response: false,
            http_server_response: false,
          },
        },
      ],
    },
  },
};