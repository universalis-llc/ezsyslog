use std::{collections::HashMap, time::{Instant, Duration}};

use crate::database;
use futures_util::StreamExt;
use poem::{
    endpoint::EmbeddedFilesEndpoint,
    handler,
    http::{Method, StatusCode},
    listener::TcpListener,
    middleware::{AddData, Cors},
    web::{Data, Json, sse::{SSE, Event}},
    EndpointExt, Request, Result, Route, Server, get,
};
use redis::aio::MultiplexedConnection;
use redis_graph::{AsyncGraphCommands, GraphValue};
use serde::Deserialize;

const PORT: u16 = 8000;
const HOST: &'static str = "::";

#[derive(Deserialize)]
struct Params {
    query: String,
}

#[derive(rust_embed::RustEmbed)]
#[folder = "app/dist/"]
struct Files;

// TODO: Remove all instances of clone for redis values

#[handler]
async fn search(
    mut db: Data<&MultiplexedConnection>,
    req: &Request,
) -> Result<Json<Vec<HashMap<String, serde_redis_graph::SerializeGraphValue>>>> {
    let mut con = db.clone();
    let params = req.params::<Params>()?;
    let query_phrase = params.query;
    let results = con
        .graph_ro_query(database::GRAPH_NAME, &query_phrase)
        .await;
    dbg!(&results);
    match results {
        Err(e) => {
            println!("Error returned from redis: {e:?}");
            Err(poem::Error::from((
                StatusCode::BAD_REQUEST,
                anyhow::anyhow!(e.to_string()),
            )))
        }
        Ok(r) => {
            println!("{query_phrase}: {metadata:#?}", metadata = r.metadata);
            let json: Vec<HashMap<String, serde_redis_graph::SerializeGraphValue>> = r
                .data
                .into_iter()
                .map(|result| {
                    result
                        .data
                        .into_iter()
                        .fold(HashMap::new(), |mut m, (k, v)| {
                            m.insert(k, extract_data(v));
                            m
                        })
                })
                .collect();
            Ok(Json(json))
        }
    }
}

mod serde_redis_graph {
    use std::{collections::HashMap, ops::Deref};

    use redis::Value;
    use redis_graph::{NodeValue, RelationValue};
    use serde::{
        ser::{SerializeMap, SerializeSeq, SerializeStruct},
        Serialize, Serializer,
    };

    pub struct SerializeProperties<'a>(pub &'a HashMap<String, Value>);
    impl Deref for SerializeProperties<'_> {
        type Target = HashMap<String, Value>;
        fn deref(&self) -> &Self::Target {
            &self.0
        }
    }
    impl Serialize for SerializeProperties<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let mut map = serializer.serialize_map(Some(self.len()))?;
            for (k, v) in self.iter() {
                map.serialize_entry(&k, &SerializeGraphValue::Scalar(v.clone()))?
            }
            map.end()
        }
    }

    pub struct GraphNode<'a>(pub &'a NodeValue);
    impl Deref for GraphNode<'_> {
        type Target = NodeValue;
        fn deref(&self) -> &Self::Target {
            &self.0
        }
    }

    impl Serialize for GraphNode<'_> {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            let mut state = serializer.serialize_struct("GraphNode", 3)?;
            state.serialize_field("id", &self.id)?;
            state.serialize_field("labels", &self.labels)?;
            state.serialize_field("properties", &SerializeProperties(&self.properties))?;
            state.end()
        }
    }

    pub enum SerializeGraphValue {
        Node(NodeValue),
        Scalar(Value),
        Relation(RelationValue)
    }

    impl Serialize for SerializeGraphValue {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            match self {
                SerializeGraphValue::Node(value) => {
                    let mut state = serializer.serialize_struct("Node", 3)?;
                    state.serialize_field("id", &value.id)?;
                    state.serialize_field("labels", &value.labels)?;
                    state.serialize_field("properties", &SerializeProperties(&value.properties))?;
                    state.end()
                }
                SerializeGraphValue::Scalar(value) => match value {
                    Value::Nil => serializer.serialize_none(),
                    Value::Int(v) => serializer.serialize_i64(*v),
                    Value::Data(v) => {
                        if serializer.is_human_readable() {
                            serializer.serialize_str(std::str::from_utf8(v).unwrap())
                        } else {
                            serializer.serialize_bytes(v)
                        }
                    }
                    Value::Bulk(vec) => {
                        let mut seq = serializer.serialize_seq(Some(vec.len()))?;
                        for e in vec {
                            seq.serialize_element(&SerializeGraphValue::Scalar(e.clone()))?;
                        }
                        seq.end()
                    }
                    Value::Status(v) => serializer.serialize_str(v),
                    Value::Okay => serializer.serialize_str("OK"),
                },
                SerializeGraphValue::Relation(relation) => {
                    let mut state = serializer.serialize_struct("Relation", 3)?;
                    state.serialize_field("id", &relation.id)?;
                    state.serialize_field("rel_type", &relation.rel_type)?;
                    state.serialize_field("src_node", &relation.src_node)?;
                    state.serialize_field("dest_node", &relation.dest_node)?;
                    state.serialize_field("properties", &SerializeProperties(&relation.properties))?;
                    state.end()
                },
            }
        }
    }
}

#[handler]
fn events() -> SSE {
    let now = Instant::now();
    SSE::new(
        tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(Duration::from_secs(1)))
            .map(move |_| Event::message(now.elapsed().as_secs().to_string())),
    )
    .keep_alive(Duration::from_secs(15))
}


fn extract_data(data: GraphValue) -> serde_redis_graph::SerializeGraphValue {
    match data {
        GraphValue::Node(node_value) => {
            serde_redis_graph::SerializeGraphValue::Node(node_value)
            // unimplemented!()
        }
        GraphValue::Scalar(value) => serde_redis_graph::SerializeGraphValue::Scalar(value),
        GraphValue::Relation(relation) => serde_redis_graph::SerializeGraphValue::Relation(relation),
    }
}

pub async fn listen() -> anyhow::Result<()> {
    println!("HTTP started!");
    let con = database::connect().await?;
    let addr = format!("{HOST}:{PORT}");
    let static_files_endpoint = EmbeddedFilesEndpoint::<Files>::new();
    let cors = Cors::new()
        .allow_method(Method::GET)
        .allow_method(Method::POST)
        .allow_origins(["http://localhost:3000", "https://localhost:3000"])
        .allow_credentials(true);
    let app = Route::new()
        .at("*", static_files_endpoint)
        .at("/search", get(search))
        .at("/events", get(events))
        .with(cors)
        .with(AddData::new(con));

    Server::new(TcpListener::bind(addr)).run(app).await?;

    Ok(())
}
