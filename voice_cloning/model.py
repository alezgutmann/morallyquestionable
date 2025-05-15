import tensorflow as tf
import numpy as np

class Model:

    def __init__(self, type_of_model: str, continuity: str, number_of_neurons: int):
        
        self.optimizer = tf.keras.optimizers.Adam(learning_rate=0.001)

        self.model = tf.keras.models.Sequential()
        
        if type_of_model == "MLP": 
            for i in range (0,1):
                self.model.add(tf.keras.layers.Dense(number_of_neurons, activation='relu'))
                self.model.add(tf.keras.layers.Dropout(0.2))
        elif type_of_model == "LSTM":
            # dataset muss reshaped werden, damit die LSTM Schicht funktioniert
            # x_all = []
            timesteps = number_of_past_values
            features = int(self.number_of_inputs / number_of_past_values)
            # self.number_of_inputs = features

            self.model.add(tf.keras.layers.Reshape((timesteps, features)))

            # for data in self.training_data:
            #     x_all.append(np.array(data.x).reshape(timesteps, features))
                


            self.model.add(tf.keras.layers.LSTM(number_of_neurons, return_sequences=True))
            self.model.add(tf.keras.layers.Dropout(0.2))
            self.model.add(tf.keras.layers.LSTM(number_of_neurons, return_sequences=True))
            self.model.add(tf.keras.layers.Dropout(0.2))
            self.model.add(tf.keras.layers.LSTM(number_of_neurons, return_sequences=False))
            self.model.add(tf.keras.layers.Dropout(0.2))
            self.model.add(tf.keras.layers.Dense(number_of_neurons, activation='relu'))                
        else:
            raise ValueError("Wrong use of type_of_model!")
        
        

        if continuity == "continuous":
            self.model.add(tf.keras.layers.Dense(self.number_of_outputs))
            self.loss_fn = tf.keras.losses.MeanSquaredError()

            self.model.compile(optimizer=self.optimizer,
                   loss=self.loss_fn,
                   metrics=['mean_absolute_error'])
        elif continuity == "categorical":
            self.model.add(tf.keras.layers.Dense(self.number_of_outputs, activation='softmax'))
            self.loss_fn = tf.keras.losses.CategoricalCrossentropy()

            self.model.compile(optimizer=self.optimizer,
                   loss=self.loss_fn,
                   metrics=['accuracy'])
        elif continuity == "binary":

            self.model.add(tf.keras.layers.Dense(1, activation='sigmoid'))
            self.loss_fn = tf.keras.losses.BinaryCrossentropy()

            self.model.compile(optimizer=self.optimizer,
                   loss=self.loss_fn,
                   metrics=['accuracy'])
        else:
            raise ValueError("Wrong use of continuity!")
        
        
       

        self.x_train = x_all[:test_part]
        self.x_test = x_all[test_part:]
        self.y_train = y_all[:test_part]
        self.y_test = y_all[test_part:]
        
        
    def train(self,epochs , x_train = None, y_train = None):

        # quasi model ohne lernen ausgetestet
        #
        # predictions = self.model(x_train).numpy()
        # print(predictions)
        # tf.nn.softmax(predictions).numpy()
        # print(predictions)
        # loss_fn(y_train, predictions).numpy()

        if x_train is None and y_train is None:
            x_train = self.x_train
            y_train = self.y_train
        
        
        
        return self.model.fit(x_train, y_train, epochs=int(epochs), batch_size=128)



    def test(self, x_test = None, y_test = None):

        if x_test is None and y_test is None:
            x_test = self.x_test
            y_test = self.y_test

        return self.model.evaluate(x_test,  y_test, verbose=2)
    

    def decision(self, x_input):
        #print(f"x_input shape: {x_input.shape}")
        x_input = np.array(x_input)
        x_input = x_input.reshape(-1,self.number_of_inputs)
        #print(f"x_input shape: {x_input.shape}")
        predictions = self.model.predict(x_input)
        # predictions = tf.nn.softmax(predictions).numpy()

        return predictions
        

    def sanity_check(self):
        #checking if the model is NOT just predicting randomly or the same value everytime
        pass
        











